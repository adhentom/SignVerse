"""Serializable epoch history for SignVerse training runs."""

from __future__ import annotations

import csv
import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Mapping

HISTORY_VERSION = "1.0"


@dataclass(frozen=True, slots=True)
class EpochRecord:
    """Losses, metrics, learning rate, and duration for one epoch."""

    epoch: int
    train_loss: float
    validation_loss: float | None
    learning_rate: float
    duration_seconds: float
    train_metrics: Mapping[str, object] = field(default_factory=dict)
    validation_metrics: Mapping[str, object] = field(default_factory=dict)

    def __post_init__(self) -> None:
        """Require a positive epoch and non-negative duration."""
        if self.epoch <= 0:
            raise ValueError("epoch must be positive.")
        if self.duration_seconds < 0:
            raise ValueError("duration_seconds must be non-negative.")

    def to_dict(self) -> dict[str, object]:
        """Return a JSON-compatible epoch record."""
        return asdict(self)

    @classmethod
    def from_dict(cls, raw: Mapping[str, Any]) -> EpochRecord:
        """Parse an epoch record from checkpoint history."""
        train_metrics = raw.get("train_metrics", {})
        validation_metrics = raw.get("validation_metrics", {})
        if not isinstance(train_metrics, dict) or not isinstance(
            validation_metrics, dict
        ):
            raise ValueError("Epoch metrics must be JSON objects.")
        validation_loss = raw.get("validation_loss")
        return cls(
            epoch=int(raw["epoch"]),
            train_loss=float(raw["train_loss"]),
            validation_loss=float(validation_loss)
            if validation_loss is not None
            else None,
            learning_rate=float(raw["learning_rate"]),
            duration_seconds=float(raw["duration_seconds"]),
            train_metrics=train_metrics,
            validation_metrics=validation_metrics,
        )


@dataclass(slots=True)
class TrainingHistory:
    """Ordered collection of completed epoch records."""

    records: list[EpochRecord] = field(default_factory=list)

    def __len__(self) -> int:
        """Return the number of completed epochs."""
        return len(self.records)

    def append(self, record: EpochRecord) -> None:
        """Append a strictly increasing epoch record."""
        if self.records and record.epoch <= self.records[-1].epoch:
            raise ValueError("History epochs must be strictly increasing.")
        self.records.append(record)

    def to_dict(self) -> dict[str, object]:
        """Return versioned JSON-compatible history."""
        return {
            "version": HISTORY_VERSION,
            "epochs": [record.to_dict() for record in self.records],
        }

    @classmethod
    def from_dict(cls, raw: Mapping[str, Any]) -> TrainingHistory:
        """Load validated history from a mapping."""
        if raw.get("version") != HISTORY_VERSION:
            raise ValueError("Unsupported or missing training history version.")
        epochs = raw.get("epochs")
        if not isinstance(epochs, list):
            raise ValueError("Training history must contain an epochs list.")
        history = cls()
        for epoch in epochs:
            if not isinstance(epoch, dict):
                raise ValueError("Every history epoch must be an object.")
            history.append(EpochRecord.from_dict(epoch))
        return history

    def save_json(self, path: str | Path) -> None:
        """Atomically export the complete history as JSON."""
        destination = Path(path).expanduser().resolve()
        destination.parent.mkdir(parents=True, exist_ok=True)
        _atomic_text(
            destination,
            json.dumps(self.to_dict(), indent=2, ensure_ascii=False) + "\n",
        )

    def save_csv(self, path: str | Path) -> None:
        """Atomically export scalar and structured epoch values as CSV."""
        destination = Path(path).expanduser().resolve()
        destination.parent.mkdir(parents=True, exist_ok=True)
        rows = [_flatten_record(record) for record in self.records]
        fields = sorted({key for row in rows for key in row})
        temporary = destination.with_name(f".{destination.name}.tmp")
        try:
            with temporary.open("w", encoding="utf-8", newline="") as output:
                writer = csv.DictWriter(output, fieldnames=fields)
                writer.writeheader()
                writer.writerows(rows)
            temporary.replace(destination)
        finally:
            temporary.unlink(missing_ok=True)


def _flatten_record(record: EpochRecord) -> dict[str, object]:
    row: dict[str, object] = {
        "epoch": record.epoch,
        "train_loss": record.train_loss,
        "validation_loss": record.validation_loss,
        "learning_rate": record.learning_rate,
        "duration_seconds": record.duration_seconds,
    }
    for prefix, metrics in (
        ("train", record.train_metrics),
        ("validation", record.validation_metrics),
    ):
        for name, value in metrics.items():
            row[f"{prefix}_{name}"] = (
                value
                if isinstance(value, (str, int, float, bool)) or value is None
                else json.dumps(value, separators=(",", ":"))
            )
    return row


def _atomic_text(destination: Path, content: str) -> None:
    temporary = destination.with_name(f".{destination.name}.tmp")
    try:
        temporary.write_text(content, encoding="utf-8")
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)
