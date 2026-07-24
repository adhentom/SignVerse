"""End-to-end training application for the SignVerse BiLSTM baseline."""

from __future__ import annotations

import argparse
import json
import logging
import random
import sys
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Iterable, Literal, Mapping, Sequence, cast

import numpy as np
import torch
import yaml  # type: ignore[import-untyped]
from torch.utils.data import DataLoader

from ai.models import BaseModel, BiLSTMConfig, ModelFactory, PoolingStrategy
from ai.training import (
    EarlyStopping,
    LabelEncoder,
    LandmarkCollator,
    Trainer,
    TrainerConfig,
    TrainingHistory,
    create_dataset_splits,
    seed_everything,
)
from ai.training.checkpoint import Scheduler
from ai.training.config import DeviceName, MonitorMode, SchedulerInterval
from ai.training.losses import ClassificationLossConfig

LOGGER = logging.getLogger("signverse.train")
DEFAULT_CONFIG = Path(__file__).resolve().parent / "configs" / "bilstm.yaml"
BatchLoader = Iterable[Mapping[str, object]]
OptimizerName = Literal["adam", "adamw", "sgd"]
SchedulerName = Literal["none", "step", "cosine", "plateau"]


class TrainingApplicationError(RuntimeError):
    """Raised when an application configuration or training run is invalid."""


@dataclass(frozen=True, slots=True)
class PathSettings:
    """Normalized input, landmark input, and artifact output paths."""

    normalized_root: Path = Path("data/normalized")
    landmarks_root: Path = Path("data/landmarks")
    output_dir: Path = Path("artifacts/bilstm")


@dataclass(frozen=True, slots=True)
class DatasetSettings:
    """Landmark dataset filters and validation settings."""

    datasets: tuple[str, ...] | None = None
    languages: tuple[str, ...] | None = None
    expected_features: int = 258
    strict: bool = True

    def __post_init__(self) -> None:
        """Require a positive landmark feature width."""
        if self.expected_features <= 0:
            raise ValueError("dataset.expected_features must be positive.")


@dataclass(frozen=True, slots=True)
class LoaderSettings:
    """PyTorch DataLoader and variable-length collation settings."""

    batch_size: int = 32
    num_workers: int = 0
    max_length: int | None = 180
    padding_value: float = 0.0
    truncation: Literal["left", "right"] = "right"
    pin_memory: bool = True

    def __post_init__(self) -> None:
        """Validate worker, batch, and truncation configuration."""
        if self.batch_size <= 0:
            raise ValueError("loader.batch_size must be positive.")
        if self.num_workers < 0:
            raise ValueError("loader.num_workers must be non-negative.")
        if self.max_length is not None and self.max_length <= 0:
            raise ValueError("loader.max_length must be positive when provided.")
        if self.truncation not in {"left", "right"}:
            raise ValueError("loader.truncation must be 'left' or 'right'.")


@dataclass(frozen=True, slots=True)
class ModelSettings:
    """BiLSTM architecture values whose class count comes from the vocabulary."""

    model_type: Literal["bilstm"] = "bilstm"
    projection_size: int = 128
    hidden_size: int = 128
    num_layers: int = 2
    dropout: float = 0.3
    bidirectional: bool = True
    pooling: PoolingStrategy = "mean"

    def __post_init__(self) -> None:
        """Validate architecture values immediately during config loading."""
        BiLSTMConfig(
            num_classes=2,
            projection_size=self.projection_size,
            hidden_size=self.hidden_size,
            num_layers=self.num_layers,
            dropout=self.dropout,
            bidirectional=self.bidirectional,
            pooling=self.pooling,
        )

    def to_model_config(self, num_classes: int, input_size: int) -> BiLSTMConfig:
        """Create the typed production model configuration."""
        return BiLSTMConfig(
            num_classes=num_classes,
            input_size=input_size,
            projection_size=self.projection_size,
            hidden_size=self.hidden_size,
            num_layers=self.num_layers,
            dropout=self.dropout,
            bidirectional=self.bidirectional,
            pooling=self.pooling,
        )


@dataclass(frozen=True, slots=True)
class OptimizerSettings:
    """Supported optimizer selection and shared hyperparameters."""

    name: OptimizerName = "adamw"
    learning_rate: float = 0.001
    weight_decay: float = 0.0001
    momentum: float = 0.9

    def __post_init__(self) -> None:
        """Validate optimizer hyperparameters."""
        if self.name not in {"adam", "adamw", "sgd"}:
            raise ValueError(f"Unsupported optimizer: {self.name}")
        if self.learning_rate <= 0:
            raise ValueError("optimizer.learning_rate must be positive.")
        if self.weight_decay < 0:
            raise ValueError("optimizer.weight_decay must be non-negative.")
        if not 0 <= self.momentum < 1:
            raise ValueError("optimizer.momentum must be in the range [0, 1).")


@dataclass(frozen=True, slots=True)
class SchedulerSettings:
    """Supported learning-rate scheduler selection and parameters."""

    name: SchedulerName = "plateau"
    step_size: int = 5
    gamma: float = 0.5
    t_max: int = 30
    factor: float = 0.5
    patience: int = 3
    min_learning_rate: float = 1e-6

    def __post_init__(self) -> None:
        """Validate scheduler configuration."""
        if self.name not in {"none", "step", "cosine", "plateau"}:
            raise ValueError(f"Unsupported scheduler: {self.name}")
        if self.step_size <= 0 or self.t_max <= 0:
            raise ValueError("scheduler step_size and t_max must be positive.")
        if not 0 < self.gamma <= 1 or not 0 < self.factor < 1:
            raise ValueError("scheduler gamma/factor values are outside valid ranges.")
        if self.patience < 0 or self.min_learning_rate < 0:
            raise ValueError(
                "scheduler patience/min_learning_rate must be non-negative."
            )


@dataclass(frozen=True, slots=True)
class RunSettings:
    """Trainer lifecycle, reproducibility, and early-stopping settings."""

    epochs: int = 50
    device: DeviceName = "auto"
    mixed_precision: bool = True
    gradient_clip_norm: float | None = 1.0
    gradient_accumulation_steps: int = 1
    scheduler_interval: SchedulerInterval = "epoch"
    monitor: str = "validation_f1_macro"
    monitor_mode: MonitorMode = "max"
    seed: int = 42
    deterministic: bool = True
    early_stopping: bool = True
    early_stopping_patience: int = 10
    early_stopping_min_delta: float = 0.0001

    def __post_init__(self) -> None:
        """Validate trainer and early-stopping values during config loading."""
        if self.epochs <= 0:
            raise ValueError("training.epochs must be positive.")
        if self.device not in {"auto", "cpu", "cuda", "mps"}:
            raise ValueError(f"Unsupported training device: {self.device}")
        if self.gradient_clip_norm is not None and self.gradient_clip_norm <= 0:
            raise ValueError("training.gradient_clip_norm must be positive.")
        if self.gradient_accumulation_steps <= 0:
            raise ValueError("training.gradient_accumulation_steps must be positive.")
        if self.scheduler_interval not in {"batch", "epoch"}:
            raise ValueError("training.scheduler_interval must be 'batch' or 'epoch'.")
        if self.monitor_mode not in {"min", "max"} or not self.monitor.strip():
            raise ValueError("training monitor and monitor_mode are invalid.")
        if self.early_stopping_patience < 0:
            raise ValueError("training.early_stopping_patience must be non-negative.")
        if self.early_stopping_min_delta < 0:
            raise ValueError("training.early_stopping_min_delta must be non-negative.")


@dataclass(frozen=True, slots=True)
class TrainingApplicationConfig:
    """Complete, serializable end-to-end training application configuration."""

    paths: PathSettings = field(default_factory=PathSettings)
    dataset: DatasetSettings = field(default_factory=DatasetSettings)
    loader: LoaderSettings = field(default_factory=LoaderSettings)
    model: ModelSettings = field(default_factory=ModelSettings)
    optimizer: OptimizerSettings = field(default_factory=OptimizerSettings)
    scheduler: SchedulerSettings = field(default_factory=SchedulerSettings)
    training: RunSettings = field(default_factory=RunSettings)
    loss: ClassificationLossConfig = field(default_factory=ClassificationLossConfig)

    def __post_init__(self) -> None:
        """Reject scheduler combinations the Trainer cannot execute."""
        if (
            self.scheduler.name == "plateau"
            and self.training.scheduler_interval != "epoch"
        ):
            raise ValueError("plateau scheduler requires scheduler_interval='epoch'.")

    def to_dict(self) -> dict[str, object]:
        """Return a JSON/YAML-compatible resolved configuration mapping."""
        return cast(dict[str, object], _json_compatible(asdict(self)))

    @classmethod
    def from_mapping(cls, raw: Mapping[str, Any]) -> TrainingApplicationConfig:
        """Parse and validate all supported configuration sections."""
        known = {
            "paths",
            "dataset",
            "loader",
            "model",
            "optimizer",
            "scheduler",
            "training",
            "loss",
        }
        unknown = sorted(set(raw) - known)
        if unknown:
            raise ValueError(f"Unknown configuration sections: {', '.join(unknown)}")
        paths = _section(raw, "paths")
        dataset = _section(raw, "dataset")
        loader = _section(raw, "loader")
        model = _section(raw, "model")
        optimizer = _section(raw, "optimizer")
        scheduler = _section(raw, "scheduler")
        training = _section(raw, "training")
        loss = _section(raw, "loss")
        _validate_section_keys(
            paths, {"normalized_root", "landmarks_root", "output_dir"}, "paths"
        )
        _validate_section_keys(
            dataset,
            {"datasets", "languages", "expected_features", "strict"},
            "dataset",
        )
        _validate_section_keys(
            loader,
            {
                "batch_size",
                "num_workers",
                "max_length",
                "padding_value",
                "truncation",
                "pin_memory",
            },
            "loader",
        )
        _validate_section_keys(
            model,
            {
                "model_type",
                "projection_size",
                "hidden_size",
                "num_layers",
                "dropout",
                "bidirectional",
                "pooling",
            },
            "model",
        )
        _validate_section_keys(
            optimizer,
            {"name", "learning_rate", "weight_decay", "momentum"},
            "optimizer",
        )
        _validate_section_keys(
            scheduler,
            {
                "name",
                "step_size",
                "gamma",
                "t_max",
                "factor",
                "patience",
                "min_learning_rate",
            },
            "scheduler",
        )
        _validate_section_keys(
            training,
            {
                "epochs",
                "device",
                "mixed_precision",
                "gradient_clip_norm",
                "gradient_accumulation_steps",
                "scheduler_interval",
                "monitor",
                "monitor_mode",
                "seed",
                "deterministic",
                "early_stopping",
                "early_stopping_patience",
                "early_stopping_min_delta",
            },
            "training",
        )
        _validate_section_keys(loss, {"label_smoothing", "class_weights"}, "loss")
        pooling = str(model.get("pooling", "mean"))
        if pooling not in {"mean", "max", "last"}:
            raise ValueError(f"Unsupported model pooling strategy: {pooling}")
        model_type = str(model.get("model_type", "bilstm"))
        if model_type != "bilstm":
            raise ValueError(f"Unsupported model type: {model_type}")
        class_weights_raw = loss.get("class_weights")
        class_weights = (
            tuple(
                float(cast(Any, value))
                for value in _sequence(class_weights_raw, "class_weights")
            )
            if class_weights_raw is not None
            else None
        )
        max_length_raw = loader.get("max_length", 180)
        clip_raw = training.get("gradient_clip_norm", 1.0)
        return cls(
            paths=PathSettings(
                normalized_root=Path(
                    str(paths.get("normalized_root", "data/normalized"))
                ),
                landmarks_root=Path(str(paths.get("landmarks_root", "data/landmarks"))),
                output_dir=Path(str(paths.get("output_dir", "artifacts/bilstm"))),
            ),
            dataset=DatasetSettings(
                datasets=_optional_strings(dataset.get("datasets"), "datasets"),
                languages=_optional_strings(dataset.get("languages"), "languages"),
                expected_features=int(dataset.get("expected_features", 258)),
                strict=_boolean(dataset.get("strict", True), "dataset.strict"),
            ),
            loader=LoaderSettings(
                batch_size=int(loader.get("batch_size", 32)),
                num_workers=int(loader.get("num_workers", 0)),
                max_length=int(max_length_raw) if max_length_raw is not None else None,
                padding_value=float(loader.get("padding_value", 0.0)),
                truncation=cast(
                    Literal["left", "right"], loader.get("truncation", "right")
                ),
                pin_memory=_boolean(
                    loader.get("pin_memory", True), "loader.pin_memory"
                ),
            ),
            model=ModelSettings(
                projection_size=int(model.get("projection_size", 128)),
                hidden_size=int(model.get("hidden_size", 128)),
                num_layers=int(model.get("num_layers", 2)),
                dropout=float(model.get("dropout", 0.3)),
                bidirectional=_boolean(
                    model.get("bidirectional", True), "model.bidirectional"
                ),
                pooling=cast(PoolingStrategy, pooling),
            ),
            optimizer=OptimizerSettings(
                name=cast(OptimizerName, str(optimizer.get("name", "adamw"))),
                learning_rate=float(optimizer.get("learning_rate", 0.001)),
                weight_decay=float(optimizer.get("weight_decay", 0.0001)),
                momentum=float(optimizer.get("momentum", 0.9)),
            ),
            scheduler=SchedulerSettings(
                name=cast(SchedulerName, str(scheduler.get("name", "plateau"))),
                step_size=int(scheduler.get("step_size", 5)),
                gamma=float(scheduler.get("gamma", 0.5)),
                t_max=int(scheduler.get("t_max", 30)),
                factor=float(scheduler.get("factor", 0.5)),
                patience=int(scheduler.get("patience", 3)),
                min_learning_rate=float(scheduler.get("min_learning_rate", 1e-6)),
            ),
            training=RunSettings(
                epochs=int(training.get("epochs", 50)),
                device=cast(DeviceName, str(training.get("device", "auto"))),
                mixed_precision=_boolean(
                    training.get("mixed_precision", True), "training.mixed_precision"
                ),
                gradient_clip_norm=float(clip_raw) if clip_raw is not None else None,
                gradient_accumulation_steps=int(
                    training.get("gradient_accumulation_steps", 1)
                ),
                scheduler_interval=cast(
                    SchedulerInterval,
                    str(training.get("scheduler_interval", "epoch")),
                ),
                monitor=str(training.get("monitor", "validation_f1_macro")),
                monitor_mode=cast(
                    MonitorMode, str(training.get("monitor_mode", "max"))
                ),
                seed=int(training.get("seed", 42)),
                deterministic=_boolean(
                    training.get("deterministic", True), "training.deterministic"
                ),
                early_stopping=_boolean(
                    training.get("early_stopping", True), "training.early_stopping"
                ),
                early_stopping_patience=int(
                    training.get("early_stopping_patience", 10)
                ),
                early_stopping_min_delta=float(
                    training.get("early_stopping_min_delta", 0.0001)
                ),
            ),
            loss=ClassificationLossConfig(
                label_smoothing=float(loss.get("label_smoothing", 0.1)),
                class_weights=class_weights,
            ),
        )


@dataclass(frozen=True, slots=True)
class ApplicationDataLoaders:
    """Train, validation, and test loaders with one stable label vocabulary."""

    train: BatchLoader
    validation: BatchLoader
    test: BatchLoader
    label_encoder: LabelEncoder


@dataclass(frozen=True, slots=True)
class TrainingArtifacts:
    """Completed history and artifact/checkpoint locations."""

    history: TrainingHistory
    output_dir: Path
    best_checkpoint: Path
    latest_checkpoint: Path


def load_training_config(
    path: str | Path = DEFAULT_CONFIG,
) -> TrainingApplicationConfig:
    """Load a YAML/JSON training configuration with compatibility path fallback."""
    source = _resolve_config_path(Path(path))
    try:
        raw = yaml.safe_load(source.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError) as error:
        raise TrainingApplicationError(
            f"Unable to read config {source}: {error}"
        ) from error
    if not isinstance(raw, dict):
        raise TrainingApplicationError(f"Training config must be an object: {source}")
    try:
        return TrainingApplicationConfig.from_mapping(raw)
    except (TypeError, ValueError) as error:
        raise TrainingApplicationError(
            f"Invalid training config {source}: {error}"
        ) from error


def build_data_loaders(config: TrainingApplicationConfig) -> ApplicationDataLoaders:
    """Load landmark splits and construct deterministic PyTorch DataLoaders."""
    splits = create_dataset_splits(
        config.paths.normalized_root,
        config.paths.landmarks_root,
        datasets=config.dataset.datasets,
        languages=config.dataset.languages,
        expected_features=config.dataset.expected_features,
        strict=config.dataset.strict,
    )
    if not splits.train:
        raise TrainingApplicationError("The selected training split is empty.")
    if not splits.validation:
        raise TrainingApplicationError("The selected validation split is empty.")
    collator = LandmarkCollator(
        max_length=config.loader.max_length,
        padding_value=config.loader.padding_value,
        truncation=config.loader.truncation,
    )
    generator = torch.Generator().manual_seed(config.training.seed)
    train_loader = DataLoader(
        splits.train,
        batch_size=config.loader.batch_size,
        shuffle=True,
        num_workers=config.loader.num_workers,
        collate_fn=collator,
        pin_memory=config.loader.pin_memory,
        worker_init_fn=seed_data_loader_worker,
        persistent_workers=config.loader.num_workers > 0,
        generator=generator,
    )
    validation_loader = DataLoader(
        splits.validation,
        batch_size=config.loader.batch_size,
        shuffle=False,
        num_workers=config.loader.num_workers,
        collate_fn=collator,
        pin_memory=config.loader.pin_memory,
        worker_init_fn=seed_data_loader_worker,
        persistent_workers=config.loader.num_workers > 0,
    )
    test_loader = DataLoader(
        splits.test,
        batch_size=config.loader.batch_size,
        shuffle=False,
        num_workers=config.loader.num_workers,
        collate_fn=collator,
        pin_memory=config.loader.pin_memory,
        worker_init_fn=seed_data_loader_worker,
        persistent_workers=config.loader.num_workers > 0,
    )
    return ApplicationDataLoaders(
        train=cast(BatchLoader, train_loader),
        validation=cast(BatchLoader, validation_loader),
        test=cast(BatchLoader, test_loader),
        label_encoder=splits.label_encoder,
    )


def create_optimizer(
    model: BaseModel, settings: OptimizerSettings
) -> torch.optim.Optimizer:
    """Create one of the supported optimizers for trainable model parameters."""
    parameters = [
        parameter for parameter in model.parameters() if parameter.requires_grad
    ]
    if not parameters:
        raise TrainingApplicationError("The model contains no trainable parameters.")
    if settings.name == "adam":
        return torch.optim.Adam(
            parameters,
            lr=settings.learning_rate,
            weight_decay=settings.weight_decay,
        )
    if settings.name == "adamw":
        return torch.optim.AdamW(
            parameters,
            lr=settings.learning_rate,
            weight_decay=settings.weight_decay,
        )
    return torch.optim.SGD(
        parameters,
        lr=settings.learning_rate,
        momentum=settings.momentum,
        weight_decay=settings.weight_decay,
    )


def create_scheduler(
    optimizer: torch.optim.Optimizer, settings: SchedulerSettings
) -> Scheduler | None:
    """Create the configured epoch/batch learning-rate scheduler."""
    if settings.name == "none":
        return None
    if settings.name == "step":
        return torch.optim.lr_scheduler.StepLR(
            optimizer, step_size=settings.step_size, gamma=settings.gamma
        )
    if settings.name == "cosine":
        return torch.optim.lr_scheduler.CosineAnnealingLR(
            optimizer,
            T_max=settings.t_max,
            eta_min=settings.min_learning_rate,
        )
    return torch.optim.lr_scheduler.ReduceLROnPlateau(
        optimizer,
        mode="min",
        factor=settings.factor,
        patience=settings.patience,
        min_lr=settings.min_learning_rate,
    )


def create_application_trainer(
    config: TrainingApplicationConfig,
    label_encoder: LabelEncoder,
) -> Trainer:
    """Create the BiLSTM, optimizer, scheduler, callbacks, and generic Trainer."""
    model_config = config.model.to_model_config(
        len(label_encoder), config.dataset.expected_features
    )
    model = ModelFactory.create(model_config)
    optimizer = create_optimizer(model, config.optimizer)
    scheduler = create_scheduler(optimizer, config.scheduler)
    callbacks = (
        [
            EarlyStopping(
                monitor=config.training.monitor,
                patience=config.training.early_stopping_patience,
                mode=config.training.monitor_mode,
                min_delta=config.training.early_stopping_min_delta,
            )
        ]
        if config.training.early_stopping
        else []
    )
    trainer_config = TrainerConfig(
        epochs=config.training.epochs,
        device=config.training.device,
        mixed_precision=config.training.mixed_precision,
        gradient_clip_norm=config.training.gradient_clip_norm,
        gradient_accumulation_steps=config.training.gradient_accumulation_steps,
        scheduler_interval=config.training.scheduler_interval,
        checkpoint_dir=config.paths.output_dir / "checkpoints",
        monitor=config.training.monitor,
        monitor_mode=config.training.monitor_mode,
        seed=config.training.seed,
        deterministic=config.training.deterministic,
        loss=config.loss,
    )
    return Trainer(
        model,
        optimizer,
        label_encoder,
        config=trainer_config,
        scheduler=scheduler,
        callbacks=callbacks,
    )


def run_training(
    config: TrainingApplicationConfig,
    *,
    resume_from: str | Path | None = None,
) -> TrainingArtifacts:
    """Run the complete configured training application and export artifacts."""
    seed_everything(config.training.seed, deterministic=config.training.deterministic)
    output_dir = config.paths.output_dir.expanduser().resolve()
    checkpoint_dir = output_dir / "checkpoints"
    if resume_from is not None and not Path(resume_from).expanduser().is_file():
        raise TrainingApplicationError(
            f"Resume checkpoint does not exist: {resume_from}"
        )
    if resume_from is None and any(
        (checkpoint_dir / filename).exists() for filename in ("best.pt", "latest.pt")
    ):
        raise TrainingApplicationError(
            f"Checkpoint output already exists in {checkpoint_dir}. "
            "Use --resume or select a different paths.output_dir."
        )
    output_dir.mkdir(parents=True, exist_ok=True)
    _atomic_json(output_dir / "run_config.json", _resolved_config(config))
    loaders = build_data_loaders(config)
    trainer = create_application_trainer(config, loaders.label_encoder)
    history = trainer.train(
        loaders.train,
        loaders.validation,
        resume_from=resume_from,
    )
    history.save_json(output_dir / "training_history.json")
    history.save_csv(output_dir / "training_history.csv")
    plot_training_history(history, output_dir)
    return TrainingArtifacts(
        history=history,
        output_dir=output_dir,
        best_checkpoint=trainer.checkpoints.best_path,
        latest_checkpoint=trainer.checkpoints.latest_path,
    )


def plot_training_history(history: TrainingHistory, output_dir: str | Path) -> None:
    """Generate loss and accuracy curve PNGs from completed epoch history."""
    if not history.records:
        raise TrainingApplicationError("Cannot plot an empty training history.")
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    destination = Path(output_dir).expanduser().resolve()
    destination.mkdir(parents=True, exist_ok=True)
    epochs = [record.epoch for record in history.records]
    train_loss = [record.train_loss for record in history.records]
    validation_loss = [
        record.validation_loss if record.validation_loss is not None else float("nan")
        for record in history.records
    ]
    figure, axis = plt.subplots(figsize=(8, 5))
    axis.plot(epochs, train_loss, marker="o", label="Train")
    if any(record.validation_loss is not None for record in history.records):
        axis.plot(epochs, validation_loss, marker="o", label="Validation")
    axis.set(title="Training and Validation Loss", xlabel="Epoch", ylabel="Loss")
    axis.grid(alpha=0.3)
    axis.legend()
    figure.tight_layout()
    _save_figure(figure, destination / "loss.png")
    plt.close(figure)

    train_accuracy = [
        _metric_or_default(record.train_metrics, "accuracy", 0.0)
        for record in history.records
    ]
    validation_accuracy = [
        _metric_or_default(record.validation_metrics, "accuracy", float("nan"))
        for record in history.records
    ]
    figure, axis = plt.subplots(figsize=(8, 5))
    axis.plot(epochs, train_accuracy, marker="o", label="Train")
    if any(record.validation_metrics for record in history.records):
        axis.plot(epochs, validation_accuracy, marker="o", label="Validation")
    axis.set(
        title="Training and Validation Accuracy",
        xlabel="Epoch",
        ylabel="Accuracy",
        ylim=(0.0, 1.0),
    )
    axis.grid(alpha=0.3)
    axis.legend()
    figure.tight_layout()
    _save_figure(figure, destination / "accuracy.png")
    plt.close(figure)


def seed_data_loader_worker(worker_id: int) -> None:
    """Seed NumPy and Python inside each deterministic DataLoader worker."""
    del worker_id
    worker_seed = torch.initial_seed() % (2**32)
    np.random.seed(worker_seed)
    random.seed(worker_seed)


def build_parser() -> argparse.ArgumentParser:
    """Build the end-to-end training command-line parser."""
    parser = argparse.ArgumentParser(description="Train the SignVerse BiLSTM model.")
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--resume", type=Path)
    parser.add_argument("--log-level", default="INFO")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    """Run end-to-end training from command-line arguments."""
    arguments = build_parser().parse_args(argv)
    logging.basicConfig(
        level=getattr(logging, str(arguments.log_level).upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    try:
        config = load_training_config(arguments.config)
        artifacts = run_training(config, resume_from=arguments.resume)
    except Exception as error:
        LOGGER.error("Training failed: %s", error)
        return 1
    LOGGER.info("Training complete. Best checkpoint: %s", artifacts.best_checkpoint)
    return 0


def _resolve_config_path(path: Path) -> Path:
    requested = path.expanduser()
    if requested.is_file():
        return requested.resolve()
    bundled = DEFAULT_CONFIG.parent / requested.name
    if requested.parent.name == "configs" and bundled.is_file():
        return bundled
    raise TrainingApplicationError(f"Training config does not exist: {requested}")


def _section(raw: Mapping[str, Any], name: str) -> dict[str, Any]:
    value = raw.get(name, {})
    if not isinstance(value, dict):
        raise ValueError(f"Configuration section '{name}' must be an object.")
    return {str(key): item for key, item in value.items()}


def _validate_section_keys(
    section: Mapping[str, object], allowed: set[str], name: str
) -> None:
    unknown = sorted(set(section) - allowed)
    if unknown:
        raise ValueError(
            f"Unknown fields in configuration section '{name}': {', '.join(unknown)}"
        )


def _sequence(value: object, name: str) -> Sequence[object]:
    if not isinstance(value, (list, tuple)):
        raise ValueError(f"{name} must be a list.")
    return value


def _optional_strings(value: object, name: str) -> tuple[str, ...] | None:
    if value is None:
        return None
    values = tuple(str(item).strip() for item in _sequence(value, name))
    if not values or any(not item for item in values):
        raise ValueError(f"{name} must contain non-empty strings.")
    return values


def _boolean(value: object, name: str) -> bool:
    if not isinstance(value, bool):
        raise ValueError(f"{name} must be a boolean.")
    return value


def _metric_float(metrics: Mapping[str, object], name: str) -> float | None:
    value = metrics.get(name)
    return float(value) if isinstance(value, (int, float)) else None


def _metric_or_default(
    metrics: Mapping[str, object], name: str, default: float
) -> float:
    value = _metric_float(metrics, name)
    return value if value is not None else default


def _json_compatible(value: object) -> object:
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, dict):
        return {str(key): _json_compatible(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_compatible(item) for item in value]
    return value


def _resolved_config(config: TrainingApplicationConfig) -> dict[str, object]:
    raw = config.to_dict()
    paths = raw.get("paths")
    if isinstance(paths, dict):
        paths["normalized_root"] = str(
            config.paths.normalized_root.expanduser().resolve()
        )
        paths["landmarks_root"] = str(
            config.paths.landmarks_root.expanduser().resolve()
        )
        paths["output_dir"] = str(config.paths.output_dir.expanduser().resolve())
    return raw


def _atomic_json(destination: Path, value: Mapping[str, object]) -> None:
    temporary = destination.with_name(f".{destination.name}.tmp")
    try:
        temporary.write_text(
            json.dumps(value, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)


def _save_figure(figure: Any, destination: Path) -> None:
    temporary = destination.with_name(f".{destination.stem}.tmp.png")
    try:
        figure.savefig(temporary, dpi=150, bbox_inches="tight", format="png")
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)


if __name__ == "__main__":
    sys.exit(main())
