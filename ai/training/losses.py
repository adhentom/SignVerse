"""Classification loss configuration for SignVerse training."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

import torch
from torch import nn


@dataclass(frozen=True, slots=True)
class ClassificationLossConfig:
    """Configure cross-entropy label smoothing and optional class weights."""

    label_smoothing: float = 0.0
    class_weights: tuple[float, ...] | None = None

    def __post_init__(self) -> None:
        """Validate smoothing and weight values."""
        if not 0.0 <= self.label_smoothing < 1.0:
            raise ValueError("label_smoothing must be in the range [0, 1).")
        if self.class_weights is not None:
            if not self.class_weights:
                raise ValueError("class_weights must not be empty when provided.")
            if any(weight <= 0 for weight in self.class_weights):
                raise ValueError("class_weights must contain only positive values.")

    @classmethod
    def from_weights(
        cls,
        class_weights: Sequence[float] | None,
        *,
        label_smoothing: float = 0.0,
    ) -> ClassificationLossConfig:
        """Build a configuration from any numeric weight sequence."""
        weights = (
            tuple(float(weight) for weight in class_weights)
            if class_weights is not None
            else None
        )
        return cls(label_smoothing=label_smoothing, class_weights=weights)


def create_classification_loss(
    config: ClassificationLossConfig | None = None,
    *,
    device: torch.device | str = "cpu",
) -> nn.CrossEntropyLoss:
    """Create a configured PyTorch cross-entropy loss module."""
    settings = config or ClassificationLossConfig()
    weight = (
        torch.tensor(settings.class_weights, dtype=torch.float32, device=device)
        if settings.class_weights is not None
        else None
    )
    return nn.CrossEntropyLoss(
        weight=weight,
        label_smoothing=settings.label_smoothing,
    )
