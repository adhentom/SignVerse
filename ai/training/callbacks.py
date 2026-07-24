"""Lifecycle callbacks for reusable training behavior."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Sequence


@dataclass(slots=True)
class CallbackContext:
    """Mutable state shared with callbacks at training lifecycle hooks."""

    epoch: int = 0
    logs: dict[str, object] = field(default_factory=dict)
    should_stop: bool = False


class Callback:
    """No-op base class for optional trainer lifecycle extensions."""

    def on_train_start(self, context: CallbackContext) -> None:
        """Run before the first epoch."""

    def on_epoch_start(self, context: CallbackContext) -> None:
        """Run before an epoch starts."""

    def on_epoch_end(self, context: CallbackContext) -> None:
        """Run after metrics and checkpoints for an epoch are available."""

    def on_train_end(self, context: CallbackContext) -> None:
        """Run after training completes or stops early."""


class CallbackList:
    """Dispatch lifecycle hooks to callbacks in registration order."""

    def __init__(self, callbacks: Sequence[Callback] | None = None) -> None:
        """Store a stable callback sequence."""
        self.callbacks = tuple(callbacks or ())

    def on_train_start(self, context: CallbackContext) -> None:
        """Dispatch the train-start hook."""
        for callback in self.callbacks:
            callback.on_train_start(context)

    def on_epoch_start(self, context: CallbackContext) -> None:
        """Dispatch the epoch-start hook."""
        for callback in self.callbacks:
            callback.on_epoch_start(context)

    def on_epoch_end(self, context: CallbackContext) -> None:
        """Dispatch the epoch-end hook."""
        for callback in self.callbacks:
            callback.on_epoch_end(context)

    def on_train_end(self, context: CallbackContext) -> None:
        """Dispatch the train-end hook."""
        for callback in self.callbacks:
            callback.on_train_end(context)


class EarlyStopping(Callback):
    """Stop after a monitored value fails to improve for several epochs."""

    def __init__(
        self,
        monitor: str = "validation_loss",
        *,
        patience: int = 5,
        mode: str = "min",
        min_delta: float = 0.0,
    ) -> None:
        """Configure monitored field, patience, direction, and minimum change."""
        if patience < 0:
            raise ValueError("patience must be non-negative.")
        if mode not in {"min", "max"}:
            raise ValueError("mode must be 'min' or 'max'.")
        if min_delta < 0:
            raise ValueError("min_delta must be non-negative.")
        self.monitor = monitor
        self.patience = patience
        self.mode = mode
        self.min_delta = min_delta
        self.best: float | None = None
        self.bad_epochs = 0

    def on_epoch_end(self, context: CallbackContext) -> None:
        """Update improvement counters and request stopping when exhausted."""
        raw_value = context.logs.get(self.monitor)
        if not isinstance(raw_value, (int, float)):
            return
        value = float(raw_value)
        improved = self.best is None or (
            value < self.best - self.min_delta
            if self.mode == "min"
            else value > self.best + self.min_delta
        )
        if improved:
            self.best = value
            self.bad_epochs = 0
            return
        self.bad_epochs += 1
        if self.bad_epochs > self.patience:
            context.should_stop = True
