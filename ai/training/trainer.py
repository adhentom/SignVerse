"""Generic PyTorch training engine for landmark sequence classifiers."""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Mapping, Sequence, TypeAlias

import torch
from torch import nn

from .callbacks import Callback, CallbackContext, CallbackList
from .checkpoint import CheckpointManager, ResumeState, Scheduler
from .config import TrainerConfig
from .history import EpochRecord, TrainingHistory
from .label_encoder import LabelEncoder
from .losses import create_classification_loss
from .metrics import ClassificationMetricAccumulator, ClassificationMetrics
from .utils import (
    ForwardFunction,
    current_learning_rate,
    default_forward,
    labels_from_batch,
    move_batch_to_device,
    resolve_device,
    seed_everything,
)

LOGGER = logging.getLogger("signverse.training.trainer")
BatchIterable: TypeAlias = Iterable[Mapping[str, object]]


@dataclass(frozen=True, slots=True)
class EvaluationResult:
    """Loss, classification metrics, size, and duration for one data pass."""

    loss: float
    metrics: ClassificationMetrics
    samples: int
    duration_seconds: float


@dataclass(frozen=True, slots=True)
class PredictionOutput:
    """CPU prediction tensors and sample IDs from an unlabeled forward pass."""

    logits: torch.Tensor
    probabilities: torch.Tensor
    predicted_ids: torch.Tensor
    sample_ids: tuple[str, ...]


class Trainer:
    """Train and evaluate any classifier that returns class logits.

    No model architecture is assumed. By default, ``landmarks`` is passed as
    the first model argument, with masks/lengths supplied when declared by the
    model. A custom ``forward_function`` can adapt any future model contract.
    """

    def __init__(
        self,
        model: nn.Module,
        optimizer: torch.optim.Optimizer,
        label_encoder: LabelEncoder,
        *,
        config: TrainerConfig | None = None,
        scheduler: Scheduler | None = None,
        criterion: nn.Module | None = None,
        callbacks: Sequence[Callback] | None = None,
        forward_function: ForwardFunction | None = None,
    ) -> None:
        """Configure training state and move the model/loss to the device."""
        self.config = config or TrainerConfig()
        if len(label_encoder) <= 1:
            raise ValueError("Classification training requires at least two labels.")
        configured_weights = self.config.loss.class_weights
        if (
            criterion is None
            and configured_weights is not None
            and len(configured_weights) != len(label_encoder)
        ):
            raise ValueError(
                "class_weights must contain one value for every label vocabulary entry."
            )
        if (
            isinstance(scheduler, torch.optim.lr_scheduler.ReduceLROnPlateau)
            and self.config.scheduler_interval == "batch"
        ):
            raise ValueError("ReduceLROnPlateau requires scheduler_interval='epoch'.")
        seed_everything(self.config.seed, deterministic=self.config.deterministic)
        self.device = resolve_device(self.config.device)
        self.model = model.to(self.device)
        self.optimizer = optimizer
        self.scheduler = scheduler
        self.label_encoder = label_encoder
        self.criterion = (
            criterion.to(self.device)
            if criterion is not None
            else create_classification_loss(self.config.loss, device=self.device)
        )
        self.callbacks = CallbackList(callbacks)
        self.forward_function = forward_function or default_forward
        self.amp_enabled = self.config.mixed_precision and self.device.type == "cuda"
        if self.config.mixed_precision and not self.amp_enabled:
            LOGGER.warning(
                "Mixed precision was requested but is only enabled for CUDA; using full precision on %s.",
                self.device,
            )
        self.scaler = torch.amp.GradScaler("cuda", enabled=self.amp_enabled)
        self.checkpoints = CheckpointManager(self.config.checkpoint_dir)
        self.history = TrainingHistory()
        self.best_metric: float | None = None
        self.completed_epoch = 0
        self._monitor_fallback_logged = False

    def train(
        self,
        train_loader: BatchIterable,
        validation_loader: BatchIterable | None = None,
        *,
        resume_from: str | Path | None = None,
    ) -> TrainingHistory:
        """Run configured epochs, validation, scheduling, and checkpointing."""
        if resume_from is not None:
            self.resume(resume_from)
        context = CallbackContext(epoch=self.completed_epoch)
        self.callbacks.on_train_start(context)
        for epoch in range(self.completed_epoch + 1, self.config.epochs + 1):
            epoch_start = time.perf_counter()
            context.epoch = epoch
            context.logs = {}
            self.callbacks.on_epoch_start(context)
            learning_rate = current_learning_rate(self.optimizer)
            train_result = self._train_epoch(train_loader)
            validation_result = (
                self.validate(validation_loader)
                if validation_loader is not None
                else None
            )
            if self.scheduler is not None and self.config.scheduler_interval == "epoch":
                scheduler_value = (
                    validation_result.loss
                    if validation_result is not None
                    else train_result.loss
                )
                self._step_scheduler(scheduler_value)

            duration = time.perf_counter() - epoch_start
            record = EpochRecord(
                epoch=epoch,
                train_loss=train_result.loss,
                validation_loss=validation_result.loss
                if validation_result is not None
                else None,
                learning_rate=learning_rate,
                duration_seconds=duration,
                train_metrics=train_result.metrics.to_dict(),
                validation_metrics=validation_result.metrics.to_dict()
                if validation_result is not None
                else {},
            )
            self.history.append(record)
            self.completed_epoch = epoch
            logs = _record_logs(record)
            monitored = self._monitor_value(logs, validation_result is not None)
            improved = self._is_improved(monitored)
            if improved:
                self.best_metric = monitored
            self.checkpoints.save(
                epoch=epoch,
                model=self.model,
                optimizer=self.optimizer,
                scheduler=self.scheduler,
                scaler=self.scaler,
                history=self.history,
                label_encoder=self.label_encoder,
                config=self.config,
                best_metric=self.best_metric,
                is_best=improved,
                save_latest=self.config.save_latest,
            )
            context.logs = logs
            self.callbacks.on_epoch_end(context)
            LOGGER.info(
                "Epoch %d/%d train_loss=%.6f validation_loss=%s duration=%.2fs",
                epoch,
                self.config.epochs,
                train_result.loss,
                f"{validation_result.loss:.6f}"
                if validation_result is not None
                else "n/a",
                duration,
            )
            if context.should_stop:
                LOGGER.info("Training stopped by callback after epoch %d.", epoch)
                break
        self.callbacks.on_train_end(context)
        return self.history

    def validate(self, loader: BatchIterable) -> EvaluationResult:
        """Evaluate the model on validation data without gradient tracking."""
        return self._evaluate(loader, stage="validation")

    def test(self, loader: BatchIterable) -> EvaluationResult:
        """Evaluate the model on held-out test data without changing state."""
        return self._evaluate(loader, stage="test")

    def predict(self, loader: BatchIterable) -> PredictionOutput:
        """Return logits, probabilities, predicted IDs, and sample IDs."""
        self.model.eval()
        logits_parts: list[torch.Tensor] = []
        sample_ids: list[str] = []
        with torch.inference_mode():
            for raw_batch in loader:
                batch = move_batch_to_device(raw_batch, self.device)
                with self._autocast():
                    logits = self.forward_function(self.model, batch)
                _validate_logits(logits, len(self.label_encoder))
                logits_parts.append(logits.detach().to("cpu"))
                raw_ids = raw_batch.get("sample_ids")
                if isinstance(raw_ids, (list, tuple)):
                    if len(raw_ids) != logits.shape[0]:
                        raise ValueError(
                            "Prediction sample_ids count does not match batch size."
                        )
                    sample_ids.extend(str(sample_id) for sample_id in raw_ids)
                else:
                    first = sum(part.shape[0] for part in logits_parts[:-1])
                    sample_ids.extend(
                        f"sample_{index}"
                        for index in range(first, first + logits.shape[0])
                    )
        if not logits_parts:
            raise ValueError("Cannot predict from an empty data loader.")
        all_logits = torch.cat(logits_parts, dim=0)
        probabilities = torch.softmax(all_logits, dim=1)
        return PredictionOutput(
            logits=all_logits,
            probabilities=probabilities,
            predicted_ids=all_logits.argmax(dim=1),
            sample_ids=tuple(sample_ids),
        )

    def resume(self, checkpoint_path: str | Path) -> ResumeState:
        """Restore model, optimizer, scheduler, scaler, history, and RNG state."""
        state = self.checkpoints.load(
            checkpoint_path,
            model=self.model,
            optimizer=self.optimizer,
            scheduler=self.scheduler,
            scaler=self.scaler,
            label_encoder=self.label_encoder,
            map_location=self.device,
        )
        self.history = state.history
        self.best_metric = state.best_metric
        self.completed_epoch = state.epoch
        LOGGER.info("Resumed training from epoch %d.", state.epoch)
        return state

    def _train_epoch(self, loader: BatchIterable) -> EvaluationResult:
        self.model.train()
        self.optimizer.zero_grad(set_to_none=True)
        metrics = ClassificationMetricAccumulator(len(self.label_encoder))
        total_loss = 0.0
        total_samples = 0
        pending_steps = 0
        started = time.perf_counter()
        for raw_batch in loader:
            batch = move_batch_to_device(raw_batch, self.device)
            labels = labels_from_batch(batch)
            with self._autocast():
                logits = self.forward_function(self.model, batch)
                _validate_logits(logits, len(self.label_encoder))
                unscaled_loss = self.criterion(logits, labels)
                loss = unscaled_loss / self.config.gradient_accumulation_steps
            self.scaler.scale(loss).backward()
            pending_steps += 1
            batch_size = int(labels.shape[0])
            total_samples += batch_size
            total_loss += float(unscaled_loss.detach().item()) * batch_size
            metrics.update(logits, labels)
            if pending_steps == self.config.gradient_accumulation_steps:
                self._optimizer_step()
                pending_steps = 0
        if pending_steps:
            correction = self.config.gradient_accumulation_steps / pending_steps
            self._optimizer_step(gradient_scale=correction)
        if total_samples == 0:
            raise ValueError("Cannot train from an empty data loader.")
        return EvaluationResult(
            loss=total_loss / total_samples,
            metrics=metrics.compute(),
            samples=total_samples,
            duration_seconds=time.perf_counter() - started,
        )

    def _evaluate(self, loader: BatchIterable, *, stage: str) -> EvaluationResult:
        self.model.eval()
        metrics = ClassificationMetricAccumulator(len(self.label_encoder))
        total_loss = 0.0
        total_samples = 0
        started = time.perf_counter()
        with torch.inference_mode():
            for raw_batch in loader:
                batch = move_batch_to_device(raw_batch, self.device)
                labels = labels_from_batch(batch)
                with self._autocast():
                    logits = self.forward_function(self.model, batch)
                    _validate_logits(logits, len(self.label_encoder))
                    loss = self.criterion(logits, labels)
                batch_size = int(labels.shape[0])
                total_samples += batch_size
                total_loss += float(loss.item()) * batch_size
                metrics.update(logits, labels)
        if total_samples == 0:
            raise ValueError(f"Cannot evaluate an empty {stage} data loader.")
        result = EvaluationResult(
            loss=total_loss / total_samples,
            metrics=metrics.compute(),
            samples=total_samples,
            duration_seconds=time.perf_counter() - started,
        )
        LOGGER.info(
            "%s loss=%.6f accuracy=%.4f", stage, result.loss, result.metrics.accuracy
        )
        return result

    def _optimizer_step(self, *, gradient_scale: float = 1.0) -> None:
        self.scaler.unscale_(self.optimizer)
        if gradient_scale != 1.0:
            for parameter in self.model.parameters():
                if parameter.grad is not None:
                    parameter.grad.mul_(gradient_scale)
        if self.config.gradient_clip_norm is not None:
            nn.utils.clip_grad_norm_(
                self.model.parameters(), self.config.gradient_clip_norm
            )
        self.scaler.step(self.optimizer)
        self.scaler.update()
        self.optimizer.zero_grad(set_to_none=True)
        if self.scheduler is not None and self.config.scheduler_interval == "batch":
            self.scheduler.step()

    def _step_scheduler(self, metric: float) -> None:
        if self.scheduler is None:
            return
        if isinstance(self.scheduler, torch.optim.lr_scheduler.ReduceLROnPlateau):
            self.scheduler.step(metric)
        else:
            self.scheduler.step()

    def _autocast(self) -> torch.autocast:
        return torch.autocast(
            device_type=self.device.type,
            dtype=torch.float16,
            enabled=self.amp_enabled,
        )

    def _monitor_value(self, logs: Mapping[str, object], has_validation: bool) -> float:
        value = logs.get(self.config.monitor)
        if isinstance(value, (int, float)):
            return float(value)
        if not has_validation and self.config.monitor == "validation_loss":
            if not self._monitor_fallback_logged:
                LOGGER.warning(
                    "No validation loader was provided; best checkpoint uses train_loss."
                )
                self._monitor_fallback_logged = True
            train_loss = logs.get("train_loss")
            if isinstance(train_loss, (int, float)):
                return float(train_loss)
        raise ValueError(
            f"Checkpoint monitor '{self.config.monitor}' is not a scalar epoch value."
        )

    def _is_improved(self, value: float) -> bool:
        if self.best_metric is None:
            return True
        if self.config.monitor_mode == "min":
            return value < self.best_metric
        return value > self.best_metric


def _validate_logits(logits: torch.Tensor, num_classes: int) -> None:
    if logits.ndim != 2 or logits.shape[1] != num_classes:
        raise ValueError(
            f"Model must return logits shaped (batch, {num_classes}), got {tuple(logits.shape)}."
        )


def _record_logs(record: EpochRecord) -> dict[str, object]:
    logs: dict[str, object] = {
        "epoch": record.epoch,
        "train_loss": record.train_loss,
        "validation_loss": record.validation_loss,
        "learning_rate": record.learning_rate,
        "duration_seconds": record.duration_seconds,
    }
    logs.update(
        {f"train_{name}": value for name, value in record.train_metrics.items()}
    )
    logs.update(
        {
            f"validation_{name}": value
            for name, value in record.validation_metrics.items()
        }
    )
    return logs
