"""Common interface for SignVerse classification models."""

from __future__ import annotations

from abc import ABC, abstractmethod

import torch
from torch import nn


class BaseModel(nn.Module, ABC):
    """Abstract interface shared by trainable landmark classifiers."""

    @abstractmethod
    def forward(
        self,
        landmarks: torch.Tensor,
        attention_mask: torch.Tensor | None = None,
        lengths: torch.Tensor | None = None,
        effective_lengths: torch.Tensor | None = None,
    ) -> torch.Tensor:
        """Return unnormalized class logits for a landmark batch."""

    @abstractmethod
    def feature_extractor(
        self,
        landmarks: torch.Tensor,
        attention_mask: torch.Tensor | None = None,
        lengths: torch.Tensor | None = None,
        effective_lengths: torch.Tensor | None = None,
    ) -> torch.Tensor:
        """Return one fixed-width representation per input sequence."""

    def predict(
        self,
        landmarks: torch.Tensor,
        attention_mask: torch.Tensor | None = None,
        lengths: torch.Tensor | None = None,
        effective_lengths: torch.Tensor | None = None,
    ) -> torch.Tensor:
        """Return class IDs without changing the model's prior training mode.

        This is a model-level convenience method only; it does not implement a
        deployment inference pipeline, preprocessing, or probability policy.
        """
        was_training = self.training
        try:
            self.eval()
            with torch.inference_mode():
                logits = self.forward(
                    landmarks,
                    attention_mask=attention_mask,
                    lengths=lengths,
                    effective_lengths=effective_lengths,
                )
                return logits.argmax(dim=1)
        finally:
            self.train(was_training)
