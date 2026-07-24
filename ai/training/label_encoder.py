"""Deterministic label vocabulary used by landmark datasets."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, Mapping

LABEL_MAPPING_VERSION = "1.0"


class LabelEncoderError(ValueError):
    """Raised when a label mapping is empty, inconsistent, or unknown."""


@dataclass(frozen=True, slots=True)
class LabelEncoder:
    """Provide stable bidirectional mappings between labels and integer IDs."""

    labels: tuple[str, ...]
    _label_to_id: dict[str, int] = field(init=False, repr=False, compare=False)

    def __post_init__(self) -> None:
        """Validate labels and construct the reverse lookup table."""
        if not self.labels:
            raise LabelEncoderError(
                "A label vocabulary must contain at least one label."
            )
        cleaned = tuple(label.strip() for label in self.labels)
        if any(not label for label in cleaned):
            raise LabelEncoderError("Label vocabulary entries must not be empty.")
        if len(set(cleaned)) != len(cleaned):
            raise LabelEncoderError("Label vocabulary contains duplicate labels.")
        object.__setattr__(self, "labels", cleaned)
        object.__setattr__(
            self, "_label_to_id", {label: index for index, label in enumerate(cleaned)}
        )

    @classmethod
    def fit(cls, labels: Iterable[str]) -> LabelEncoder:
        """Create a deterministic vocabulary from an iterable of labels."""
        unique = {label.strip() for label in labels if label.strip()}
        if not unique:
            raise LabelEncoderError("Cannot fit a label encoder without labels.")
        return cls(tuple(sorted(unique, key=lambda label: (label.casefold(), label))))

    @property
    def label_to_id(self) -> Mapping[str, int]:
        """Return the read-only label-to-ID mapping interface."""
        return dict(self._label_to_id)

    @property
    def id_to_label(self) -> Mapping[int, str]:
        """Return the read-only ID-to-label mapping interface."""
        return dict(enumerate(self.labels))

    def __len__(self) -> int:
        """Return the vocabulary size."""
        return len(self.labels)

    def encode(self, label: str) -> int:
        """Return the integer ID for a label or raise a clear error."""
        try:
            return self._label_to_id[label]
        except KeyError as error:
            raise LabelEncoderError(f"Unknown label: {label!r}") from error

    def decode(self, label_id: int) -> str:
        """Return the label for an integer ID or raise a clear error."""
        if label_id < 0 or label_id >= len(self.labels):
            raise LabelEncoderError(f"Unknown label ID: {label_id}")
        return self.labels[label_id]

    def encode_many(self, labels: Iterable[str]) -> list[int]:
        """Encode several labels in input order."""
        return [self.encode(label) for label in labels]

    def decode_many(self, label_ids: Iterable[int]) -> list[str]:
        """Decode several IDs in input order."""
        return [self.decode(label_id) for label_id in label_ids]

    def to_dict(self) -> dict[str, object]:
        """Return a versioned JSON-compatible mapping."""
        return {
            "version": LABEL_MAPPING_VERSION,
            "labels": list(self.labels),
            "label_to_id": dict(self._label_to_id),
        }

    def save(self, path: str | Path) -> None:
        """Atomically save this vocabulary as JSON."""
        destination = Path(path).expanduser().resolve()
        destination.parent.mkdir(parents=True, exist_ok=True)
        temporary = destination.with_name(f".{destination.name}.tmp")
        try:
            temporary.write_text(
                json.dumps(self.to_dict(), indent=2, ensure_ascii=False) + "\n",
                encoding="utf-8",
            )
            temporary.replace(destination)
        finally:
            temporary.unlink(missing_ok=True)

    @classmethod
    def load(cls, path: str | Path) -> LabelEncoder:
        """Load and validate a saved JSON vocabulary."""
        source = Path(path).expanduser().resolve()
        try:
            raw = json.loads(source.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise LabelEncoderError(
                f"Unable to read label mapping {source}: {error}"
            ) from error
        if not isinstance(raw, dict) or raw.get("version") != LABEL_MAPPING_VERSION:
            raise LabelEncoderError(
                f"Unsupported or missing label mapping version in {source}."
            )
        labels = raw.get("labels")
        if not isinstance(labels, list) or not all(
            isinstance(label, str) for label in labels
        ):
            raise LabelEncoderError("Label mapping must contain a string labels list.")
        encoder = cls(tuple(labels))
        stored_mapping = raw.get("label_to_id")
        if stored_mapping is not None and stored_mapping != dict(encoder.label_to_id):
            raise LabelEncoderError(
                "Saved label_to_id mapping is inconsistent with labels."
            )
        return encoder
