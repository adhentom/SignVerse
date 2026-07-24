"""Validated configuration for the reusable SignVerse trainer."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Literal

from .losses import ClassificationLossConfig

DeviceName = Literal["auto", "cpu", "cuda", "mps"]
MonitorMode = Literal["min", "max"]
SchedulerInterval = Literal["batch", "epoch"]


@dataclass(frozen=True, slots=True)
class TrainerConfig:
    """Training loop, device, optimization, and checkpoint behavior."""

    epochs: int = 10
    device: DeviceName = "auto"
    mixed_precision: bool = False
    gradient_clip_norm: float | None = None
    gradient_accumulation_steps: int = 1
    scheduler_interval: SchedulerInterval = "epoch"
    checkpoint_dir: Path = Path("artifacts/checkpoints")
    monitor: str = "validation_loss"
    monitor_mode: MonitorMode = "min"
    seed: int = 42
    deterministic: bool = True
    save_latest: bool = True
    loss: ClassificationLossConfig = field(default_factory=ClassificationLossConfig)

    def __post_init__(self) -> None:
        """Reject unsafe or internally inconsistent settings."""
        if self.epochs <= 0:
            raise ValueError("epochs must be positive.")
        if self.gradient_accumulation_steps <= 0:
            raise ValueError("gradient_accumulation_steps must be positive.")
        if self.gradient_clip_norm is not None and self.gradient_clip_norm <= 0:
            raise ValueError("gradient_clip_norm must be positive when provided.")
        if not self.monitor.strip():
            raise ValueError("monitor must not be empty.")
        if self.device not in {"auto", "cpu", "cuda", "mps"}:
            raise ValueError(f"Unsupported device selection: {self.device}")
        if self.monitor_mode not in {"min", "max"}:
            raise ValueError("monitor_mode must be 'min' or 'max'.")
        if self.scheduler_interval not in {"batch", "epoch"}:
            raise ValueError("scheduler_interval must be 'batch' or 'epoch'.")

    def to_dict(self) -> dict[str, object]:
        """Return a checkpoint-safe configuration mapping."""
        raw = asdict(self)
        raw["checkpoint_dir"] = str(self.checkpoint_dir)
        return raw
