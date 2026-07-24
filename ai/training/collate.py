"""Batch collation for variable-length landmark sequences."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Mapping, Sequence, TypedDict

import torch

from .dataset import LandmarkDatasetItem


class LandmarkBatch(TypedDict):
    """Padded tensors and provenance returned by landmark collation."""

    landmarks: torch.Tensor
    labels: torch.Tensor
    attention_mask: torch.Tensor
    lengths: torch.Tensor
    effective_lengths: torch.Tensor
    sample_ids: list[str]
    metadata: list[Mapping[str, object]]


@dataclass(frozen=True, slots=True)
class LandmarkCollator:
    """Callable configuration suitable for ``torch.utils.data.DataLoader``."""

    max_length: int | None = None
    padding_value: float = 0.0
    truncation: Literal["left", "right"] = "right"

    def __post_init__(self) -> None:
        """Validate padding and truncation settings."""
        if self.max_length is not None and self.max_length <= 0:
            raise ValueError("max_length must be positive when provided.")
        if self.truncation not in {"left", "right"}:
            raise ValueError("truncation must be 'left' or 'right'.")

    def __call__(self, batch: Sequence[LandmarkDatasetItem]) -> LandmarkBatch:
        """Pad and optionally truncate a sequence batch."""
        return collate_landmark_batch(
            batch,
            max_length=self.max_length,
            padding_value=self.padding_value,
            truncation=self.truncation,
        )


def collate_landmark_batch(
    batch: Sequence[LandmarkDatasetItem],
    *,
    max_length: int | None = None,
    padding_value: float = 0.0,
    truncation: Literal["left", "right"] = "right",
) -> LandmarkBatch:
    """Pad variable-length sequences and return masks and original lengths."""
    if not batch:
        raise ValueError("Cannot collate an empty landmark batch.")
    if max_length is not None and max_length <= 0:
        raise ValueError("max_length must be positive when provided.")
    if truncation not in {"left", "right"}:
        raise ValueError("truncation must be 'left' or 'right'.")
    features = int(batch[0].landmarks.shape[1])
    for item in batch:
        if item.landmarks.ndim != 2 or item.landmarks.shape[1] != features:
            raise ValueError("Every batch sequence must have the same feature width.")

    original_lengths = [int(item.landmarks.shape[0]) for item in batch]
    target_length = max(original_lengths)
    if max_length is not None:
        target_length = min(target_length, max_length)
    effective_lengths = [min(length, target_length) for length in original_lengths]
    padded = torch.full(
        (len(batch), target_length, features),
        fill_value=padding_value,
        dtype=batch[0].landmarks.dtype,
        device=batch[0].landmarks.device,
    )
    attention_mask = torch.zeros(
        (len(batch), target_length),
        dtype=torch.bool,
        device=batch[0].landmarks.device,
    )
    for row, (item, length) in enumerate(zip(batch, effective_lengths, strict=True)):
        sequence = (
            item.landmarks[-length:]
            if truncation == "left"
            else item.landmarks[:length]
        )
        padded[row, :length] = sequence
        attention_mask[row, :length] = True

    return LandmarkBatch(
        landmarks=padded,
        labels=torch.tensor(
            [item.label_id for item in batch],
            dtype=torch.long,
            device=padded.device,
        ),
        attention_mask=attention_mask,
        lengths=torch.tensor(original_lengths, dtype=torch.long, device=padded.device),
        effective_lengths=torch.tensor(
            effective_lengths, dtype=torch.long, device=padded.device
        ),
        sample_ids=[item.sample_id for item in batch],
        metadata=[item.metadata for item in batch],
    )
