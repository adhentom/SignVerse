"""Bidirectional LSTM baseline for isolated sign classification."""

from __future__ import annotations

import logging
from dataclasses import asdict, dataclass, field
from typing import Any, Literal, Mapping, cast

import torch
from torch import nn
from torch.nn.utils.rnn import pack_padded_sequence, pad_packed_sequence

from ai.preprocessing.landmark_schema import DEFAULT_LANDMARK_SCHEMA

from .base import BaseModel

LOGGER = logging.getLogger("signverse.models.bilstm")
PoolingStrategy = Literal["mean", "max", "last"]


@dataclass(frozen=True, slots=True)
class BiLSTMConfig:
    """Architecture configuration for :class:`BiLSTMClassifier`."""

    num_classes: int
    input_size: int = DEFAULT_LANDMARK_SCHEMA.vector_size
    projection_size: int = 128
    hidden_size: int = 128
    num_layers: int = 2
    dropout: float = 0.3
    bidirectional: bool = True
    pooling: PoolingStrategy = "mean"
    model_type: Literal["bilstm"] = field(default="bilstm", init=False)

    def __post_init__(self) -> None:
        """Validate dimensions, probability values, and pooling strategy."""
        if self.num_classes <= 1:
            raise ValueError("num_classes must be greater than one.")
        for name, value in (
            ("input_size", self.input_size),
            ("projection_size", self.projection_size),
            ("hidden_size", self.hidden_size),
            ("num_layers", self.num_layers),
        ):
            if value <= 0:
                raise ValueError(f"{name} must be positive.")
        if not 0.0 <= self.dropout < 1.0:
            raise ValueError("dropout must be in the range [0, 1).")
        if self.pooling not in {"mean", "max", "last"}:
            raise ValueError("pooling must be 'mean', 'max', or 'last'.")

    @property
    def recurrent_output_size(self) -> int:
        """Return the concatenated recurrent feature width."""
        return self.hidden_size * (2 if self.bidirectional else 1)

    def to_dict(self) -> dict[str, object]:
        """Return a JSON-compatible model configuration."""
        return asdict(self)

    @classmethod
    def from_dict(cls, raw: Mapping[str, Any]) -> BiLSTMConfig:
        """Parse a BiLSTM configuration mapping with clear type errors."""
        model_type = raw.get("model_type", raw.get("name", "bilstm"))
        if model_type != "bilstm":
            raise ValueError(f"BiLSTMConfig cannot load model type {model_type!r}.")
        allowed = {
            "model_type",
            "name",
            "num_classes",
            "input_size",
            "projection_size",
            "hidden_size",
            "num_layers",
            "dropout",
            "bidirectional",
            "pooling",
        }
        unknown = sorted(set(raw) - allowed)
        if unknown:
            raise ValueError(
                f"Unknown BiLSTM configuration fields: {', '.join(unknown)}"
            )
        try:
            pooling_value = str(raw.get("pooling", "mean"))
            if pooling_value not in {"mean", "max", "last"}:
                raise ValueError(f"invalid pooling strategy {pooling_value!r}")
            bidirectional_value = raw.get("bidirectional", True)
            if not isinstance(bidirectional_value, bool):
                raise TypeError("bidirectional must be a boolean")
            return cls(
                num_classes=int(raw["num_classes"]),
                input_size=int(
                    raw.get("input_size", DEFAULT_LANDMARK_SCHEMA.vector_size)
                ),
                projection_size=int(raw.get("projection_size", 128)),
                hidden_size=int(raw.get("hidden_size", 128)),
                num_layers=int(raw.get("num_layers", 2)),
                dropout=float(raw.get("dropout", 0.3)),
                bidirectional=bidirectional_value,
                pooling=cast(PoolingStrategy, pooling_value),
            )
        except (KeyError, TypeError, ValueError) as error:
            raise ValueError(f"Invalid BiLSTM configuration: {error}") from error


class BiLSTMClassifier(BaseModel):
    """Projection-normalized, packed BiLSTM landmark classifier."""

    def __init__(self, config: BiLSTMConfig) -> None:
        """Construct the baseline architecture without loss or softmax layers."""
        super().__init__()
        self.config = config
        self.input_projection = nn.Linear(config.input_size, config.projection_size)
        self.input_normalization = nn.LayerNorm(config.projection_size)
        self.recurrent = nn.LSTM(
            input_size=config.projection_size,
            hidden_size=config.hidden_size,
            num_layers=config.num_layers,
            batch_first=True,
            dropout=config.dropout if config.num_layers > 1 else 0.0,
            bidirectional=config.bidirectional,
        )
        self.output_dropout = nn.Dropout(config.dropout)
        self.classification_head = nn.Linear(
            config.recurrent_output_size, config.num_classes
        )
        LOGGER.info(
            "Created BiLSTM classifier: classes=%d hidden=%d layers=%d bidirectional=%s pooling=%s parameters=%d",
            config.num_classes,
            config.hidden_size,
            config.num_layers,
            config.bidirectional,
            config.pooling,
            sum(parameter.numel() for parameter in self.parameters()),
        )

    def forward(
        self,
        landmarks: torch.Tensor,
        attention_mask: torch.Tensor | None = None,
        lengths: torch.Tensor | None = None,
        effective_lengths: torch.Tensor | None = None,
    ) -> torch.Tensor:
        """Return raw class logits shaped ``(batch, num_classes)``."""
        features = self.feature_extractor(
            landmarks,
            attention_mask=attention_mask,
            lengths=lengths,
            effective_lengths=effective_lengths,
        )
        return cast(torch.Tensor, self.classification_head(features))

    def feature_extractor(
        self,
        landmarks: torch.Tensor,
        attention_mask: torch.Tensor | None = None,
        lengths: torch.Tensor | None = None,
        effective_lengths: torch.Tensor | None = None,
    ) -> torch.Tensor:
        """Encode and temporally pool variable-length landmark sequences."""
        _validate_landmarks(landmarks, self.config.input_size)
        sequence_lengths = _resolve_lengths(
            landmarks,
            attention_mask=attention_mask,
            lengths=lengths,
            effective_lengths=effective_lengths,
        )
        projected = self.input_normalization(self.input_projection(landmarks))
        packed = pack_padded_sequence(
            projected,
            sequence_lengths.detach().to(device="cpu", dtype=torch.long),
            batch_first=True,
            enforce_sorted=False,
        )
        packed_output, _ = self.recurrent(packed)
        recurrent_output, _ = pad_packed_sequence(
            packed_output,
            batch_first=True,
            total_length=landmarks.shape[1],
        )
        recurrent_output = self.output_dropout(recurrent_output)
        mask = _length_mask(
            sequence_lengths, landmarks.shape[1], recurrent_output.device
        )
        return _temporal_pool(
            recurrent_output,
            mask,
            sequence_lengths,
            self.config.pooling,
        )


def _validate_landmarks(landmarks: torch.Tensor, expected_features: int) -> None:
    if landmarks.ndim != 3:
        raise ValueError(
            "Landmark input must have shape (batch, sequence_length, features)."
        )
    if landmarks.shape[0] <= 0 or landmarks.shape[1] <= 0:
        raise ValueError("Landmark batches and sequences must not be empty.")
    if landmarks.shape[2] != expected_features:
        raise ValueError(
            f"Expected {expected_features} landmark features, got {landmarks.shape[2]}."
        )
    if not torch.is_floating_point(landmarks):
        raise TypeError("Landmark input must use a floating-point dtype.")


def _resolve_lengths(
    landmarks: torch.Tensor,
    *,
    attention_mask: torch.Tensor | None,
    lengths: torch.Tensor | None,
    effective_lengths: torch.Tensor | None,
) -> torch.Tensor:
    batch_size, sequence_length = landmarks.shape[:2]
    mask_lengths: torch.Tensor | None = None
    if attention_mask is not None:
        if attention_mask.shape != (batch_size, sequence_length):
            raise ValueError("attention_mask must have shape (batch, sequence_length).")
        if attention_mask.dtype != torch.bool and not torch.all(
            (attention_mask == 0) | (attention_mask == 1)
        ):
            raise ValueError("attention_mask values must be boolean or binary.")
        boolean_mask = attention_mask.to(device=landmarks.device, dtype=torch.bool)
        mask_lengths = boolean_mask.sum(dim=1, dtype=torch.long)
        expected_mask = _length_mask(mask_lengths, sequence_length, landmarks.device)
        if not torch.equal(boolean_mask, expected_mask):
            raise ValueError(
                "attention_mask must contain a contiguous valid prefix for each sequence."
            )

    selected = effective_lengths
    if selected is None:
        selected = mask_lengths if mask_lengths is not None else lengths
    if selected is None:
        selected = torch.full(
            (batch_size,), sequence_length, dtype=torch.long, device=landmarks.device
        )
    if selected.ndim != 1 or selected.shape[0] != batch_size:
        raise ValueError("Sequence lengths must have shape (batch,).")
    selected = selected.to(device=landmarks.device, dtype=torch.long)
    if torch.any(selected <= 0):
        raise ValueError("Every sequence length must be positive.")
    if effective_lengths is not None and torch.any(selected > sequence_length):
        raise ValueError("effective_lengths cannot exceed the padded sequence length.")
    selected = selected.clamp(max=sequence_length)
    if mask_lengths is not None and not torch.equal(selected, mask_lengths):
        raise ValueError(
            "Sequence lengths and attention_mask describe different frames."
        )
    return selected


def _length_mask(
    lengths: torch.Tensor, sequence_length: int, device: torch.device
) -> torch.Tensor:
    positions = torch.arange(sequence_length, device=device).unsqueeze(0)
    return positions < lengths.to(device=device).unsqueeze(1)


def _temporal_pool(
    sequence: torch.Tensor,
    mask: torch.Tensor,
    lengths: torch.Tensor,
    strategy: PoolingStrategy,
) -> torch.Tensor:
    if strategy == "mean":
        weights = mask.unsqueeze(-1).to(sequence.dtype)
        return (sequence * weights).sum(dim=1) / lengths.to(
            device=sequence.device, dtype=sequence.dtype
        ).unsqueeze(1)
    if strategy == "max":
        masked = sequence.masked_fill(
            ~mask.unsqueeze(-1), torch.finfo(sequence.dtype).min
        )
        return masked.max(dim=1).values
    indices = (lengths.to(device=sequence.device) - 1).view(-1, 1, 1)
    indices = indices.expand(-1, 1, sequence.shape[2])
    return sequence.gather(dim=1, index=indices).squeeze(1)
