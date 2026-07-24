"""Atomic training checkpoint save and resume support."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping, TypeAlias, cast

import torch
from torch import nn

from .config import TrainerConfig
from .history import TrainingHistory
from .label_encoder import LabelEncoder
from .utils import capture_rng_state, restore_rng_state

Scheduler: TypeAlias = (
    torch.optim.lr_scheduler.LRScheduler | torch.optim.lr_scheduler.ReduceLROnPlateau
)


class CheckpointError(RuntimeError):
    """Raised when a training checkpoint is missing or incompatible."""


@dataclass(frozen=True, slots=True)
class ResumeState:
    """Training position and history restored from a checkpoint."""

    epoch: int
    best_metric: float | None
    history: TrainingHistory


class CheckpointManager:
    """Save and restore complete trainer state in one directory."""

    def __init__(self, directory: str | Path) -> None:
        """Resolve the output directory without creating it prematurely."""
        self.directory = Path(directory).expanduser().resolve()

    @property
    def latest_path(self) -> Path:
        """Return the conventional latest-checkpoint path."""
        return self.directory / "latest.pt"

    @property
    def best_path(self) -> Path:
        """Return the conventional best-checkpoint path."""
        return self.directory / "best.pt"

    def save(
        self,
        *,
        epoch: int,
        model: nn.Module,
        optimizer: torch.optim.Optimizer,
        scheduler: Scheduler | None,
        scaler: torch.amp.GradScaler,
        history: TrainingHistory,
        label_encoder: LabelEncoder,
        config: TrainerConfig,
        best_metric: float | None,
        is_best: bool,
        save_latest: bool = True,
    ) -> None:
        """Atomically save latest/best state plus history and label vocabulary."""
        self.directory.mkdir(parents=True, exist_ok=True)
        state: dict[str, object] = {
            "version": "1.0",
            "epoch": epoch,
            "model_state_dict": model.state_dict(),
            "optimizer_state_dict": optimizer.state_dict(),
            "scheduler_state_dict": scheduler.state_dict()
            if scheduler is not None
            else None,
            "scaler_state_dict": scaler.state_dict(),
            "history": history.to_dict(),
            "label_vocabulary": label_encoder.to_dict(),
            "config": config.to_dict(),
            "best_metric": best_metric,
            "rng_state": capture_rng_state(),
        }
        if save_latest:
            _atomic_torch_save(state, self.latest_path)
        if is_best:
            _atomic_torch_save(state, self.best_path)
        history.save_json(self.directory / "history.json")
        history.save_csv(self.directory / "history.csv")
        label_encoder.save(self.directory / "labels.json")

    def load(
        self,
        path: str | Path,
        *,
        model: nn.Module,
        optimizer: torch.optim.Optimizer | None = None,
        scheduler: Scheduler | None = None,
        scaler: torch.amp.GradScaler | None = None,
        label_encoder: LabelEncoder | None = None,
        map_location: torch.device | str = "cpu",
        restore_rng: bool = True,
    ) -> ResumeState:
        """Restore model and optional training state from a checkpoint."""
        source = Path(path).expanduser().resolve()
        if not source.is_file():
            raise CheckpointError(f"Checkpoint does not exist: {source}")
        try:
            raw: Any = torch.load(source, map_location=map_location, weights_only=False)
        except (OSError, RuntimeError, ValueError) as error:
            raise CheckpointError(
                f"Unable to load checkpoint {source}: {error}"
            ) from error
        if not isinstance(raw, dict) or raw.get("version") != "1.0":
            raise CheckpointError(f"Unsupported checkpoint format: {source}")
        try:
            model_state = _mapping(raw, "model_state_dict")
            model.load_state_dict(model_state)
            if optimizer is not None:
                optimizer.load_state_dict(dict(_mapping(raw, "optimizer_state_dict")))
            scheduler_state = raw.get("scheduler_state_dict")
            if scheduler is not None and isinstance(scheduler_state, dict):
                scheduler.load_state_dict(scheduler_state)
            scaler_state = raw.get("scaler_state_dict")
            if scaler is not None and isinstance(scaler_state, dict):
                scaler.load_state_dict(scaler_state)
            history_raw = _mapping(raw, "history")
            history = TrainingHistory.from_dict(history_raw)
            _validate_vocabulary(raw.get("label_vocabulary"), label_encoder)
            rng_state = raw.get("rng_state")
            if restore_rng and isinstance(rng_state, dict):
                restore_rng_state(rng_state)
            best_metric_raw = raw.get("best_metric")
            return ResumeState(
                epoch=int(raw["epoch"]),
                best_metric=float(best_metric_raw)
                if best_metric_raw is not None
                else None,
                history=history,
            )
        except (KeyError, TypeError, ValueError, RuntimeError) as error:
            raise CheckpointError(f"Invalid checkpoint {source}: {error}") from error


def _mapping(raw: Mapping[str, object], key: str) -> Mapping[str, Any]:
    value = raw.get(key)
    if not isinstance(value, dict):
        raise CheckpointError(f"Checkpoint field '{key}' must be a mapping.")
    return cast(Mapping[str, Any], value)


def _validate_vocabulary(raw: object, expected: LabelEncoder | None) -> None:
    if not isinstance(raw, dict) or not isinstance(raw.get("labels"), list):
        raise CheckpointError("Checkpoint label vocabulary is missing or invalid.")
    if expected is not None and tuple(raw["labels"]) != expected.labels:
        raise CheckpointError(
            "Checkpoint label vocabulary does not match the current dataset."
        )


def _atomic_torch_save(state: Mapping[str, object], destination: Path) -> None:
    temporary = destination.with_name(f".{destination.name}.tmp")
    try:
        torch.save(dict(state), temporary)
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)
