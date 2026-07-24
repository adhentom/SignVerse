"""Canonical, model-independent SignVerse dataset schema."""

from __future__ import annotations

import json
from collections import Counter
from dataclasses import asdict, dataclass
from pathlib import Path, PurePosixPath
from typing import Any, Literal, Mapping, Sequence, cast

Split = Literal["train", "validation", "test"]
VALID_SPLITS = frozenset({"train", "validation", "test"})
SPLIT_ORDER: tuple[Split, ...] = ("test", "train", "validation")
SCHEMA_VERSION = "1.0"


class DatasetSchemaError(ValueError):
    """Raised when a canonical annotation or manifest is invalid."""


@dataclass(frozen=True, slots=True)
class Resolution:
    """Positive video dimensions in pixels."""

    width: int
    height: int

    def validate(self) -> None:
        """Raise when either dimension is non-positive."""
        if self.width <= 0 or self.height <= 0:
            raise DatasetSchemaError(
                f"Resolution must be positive, received {self.width}x{self.height}."
            )


@dataclass(frozen=True, slots=True)
class CanonicalAnnotation:
    """One normalized raw-video sample ready for later preprocessing."""

    id: str
    video: str
    label: str
    dataset: str
    split: Split
    fps: float
    duration: float
    resolution: Resolution

    def validate(self, root: Path | None = None) -> None:
        """Validate fields and optionally verify the normalized video exists."""
        if not self.id.strip():
            raise DatasetSchemaError("Annotation id must not be empty.")
        video_path = PurePosixPath(self.video)
        if video_path.is_absolute() or ".." in video_path.parts:
            raise DatasetSchemaError(
                f"Annotation '{self.id}' has an unsafe video path: {self.video}"
            )
        if video_path.suffix.casefold() != ".mp4":
            raise DatasetSchemaError(
                f"Annotation '{self.id}' must reference a canonical MP4 video."
            )
        if not self.label.strip():
            raise DatasetSchemaError(f"Annotation '{self.id}' has an empty label.")
        if not self.dataset.strip():
            raise DatasetSchemaError(f"Annotation '{self.id}' has an empty dataset.")
        if self.split not in VALID_SPLITS:
            raise DatasetSchemaError(
                f"Annotation '{self.id}' has invalid split '{self.split}'."
            )
        if self.fps <= 0 or self.duration <= 0:
            raise DatasetSchemaError(
                f"Annotation '{self.id}' must have positive FPS and duration."
            )
        self.resolution.validate()
        if root is not None and not (root / Path(self.video)).is_file():
            raise DatasetSchemaError(
                f"Annotation '{self.id}' references a missing video: {self.video}"
            )

    def to_dict(self) -> dict[str, object]:
        """Return a JSON-compatible annotation mapping."""
        return asdict(self)

    @classmethod
    def from_dict(cls, raw: Mapping[str, Any]) -> CanonicalAnnotation:
        """Parse and validate an annotation mapping."""
        resolution = raw.get("resolution")
        if not isinstance(resolution, dict):
            raise DatasetSchemaError("Annotation resolution must be an object.")
        try:
            split_value = str(raw["split"])
            if split_value not in VALID_SPLITS:
                raise DatasetSchemaError(f"Invalid annotation split: {split_value}")
            annotation = cls(
                id=str(raw["id"]),
                video=str(raw["video"]),
                label=str(raw["label"]),
                dataset=str(raw["dataset"]),
                split=cast(Split, split_value),
                fps=float(raw["fps"]),
                duration=float(raw["duration"]),
                resolution=Resolution(
                    width=int(resolution["width"]),
                    height=int(resolution["height"]),
                ),
            )
        except (KeyError, TypeError, ValueError) as error:
            raise DatasetSchemaError(f"Invalid annotation mapping: {error}") from error
        annotation.validate()
        return annotation


@dataclass(frozen=True, slots=True)
class DatasetStatistics:
    """Aggregate statistics and duplicate-label detection results."""

    total_samples: int
    total_duration_seconds: float
    average_fps: float
    by_dataset: dict[str, int]
    by_split: dict[str, int]
    by_label: dict[str, int]
    duplicate_labels: dict[str, int]

    @classmethod
    def from_annotations(
        cls, annotations: Sequence[CanonicalAnnotation]
    ) -> DatasetStatistics:
        """Calculate deterministic statistics for canonical annotations."""
        datasets = Counter(annotation.dataset for annotation in annotations)
        splits = Counter(annotation.split for annotation in annotations)
        labels = Counter(annotation.label.casefold() for annotation in annotations)
        total = len(annotations)
        return cls(
            total_samples=total,
            total_duration_seconds=round(
                sum(annotation.duration for annotation in annotations), 6
            ),
            average_fps=round(
                sum(annotation.fps for annotation in annotations) / total, 6
            )
            if total
            else 0.0,
            by_dataset=dict(sorted(datasets.items())),
            by_split={split: splits.get(split, 0) for split in SPLIT_ORDER},
            by_label=dict(sorted(labels.items())),
            duplicate_labels={
                label: count for label, count in sorted(labels.items()) if count > 1
            },
        )

    def to_dict(self) -> dict[str, object]:
        """Return JSON-compatible statistics."""
        return asdict(self)


@dataclass(frozen=True, slots=True)
class NormalizedDatasetManifest:
    """Versioned collection of canonical annotations and statistics."""

    annotations: tuple[CanonicalAnnotation, ...]
    statistics: DatasetStatistics
    schema_version: str = SCHEMA_VERSION

    def validate(self, root: Path | None = None) -> None:
        """Validate every sample and reject duplicate ids or video paths."""
        ids: set[str] = set()
        videos: set[str] = set()
        for annotation in self.annotations:
            annotation.validate(root)
            if annotation.id in ids:
                raise DatasetSchemaError(f"Duplicate annotation id: {annotation.id}")
            if annotation.video in videos:
                raise DatasetSchemaError(
                    f"Duplicate normalized video path: {annotation.video}"
                )
            ids.add(annotation.id)
            videos.add(annotation.video)
        expected = DatasetStatistics.from_annotations(self.annotations)
        if self.statistics != expected:
            raise DatasetSchemaError("Manifest statistics do not match annotations.")

    def to_dict(self) -> dict[str, object]:
        """Return the complete JSON-compatible manifest."""
        return {
            "schema_version": self.schema_version,
            "annotations": [annotation.to_dict() for annotation in self.annotations],
            "statistics": self.statistics.to_dict(),
        }

    def write(self, path: Path) -> None:
        """Validate and atomically write the manifest as JSON."""
        self.validate(path.parent)
        temporary = path.with_name(f".{path.name}.tmp")
        try:
            temporary.write_text(
                json.dumps(self.to_dict(), indent=2, ensure_ascii=False) + "\n",
                encoding="utf-8",
            )
            temporary.replace(path)
        finally:
            temporary.unlink(missing_ok=True)


def load_manifest(path: str | Path) -> NormalizedDatasetManifest:
    """Load and validate a canonical normalized dataset manifest."""
    manifest_path = Path(path).expanduser().resolve()
    try:
        raw = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise DatasetSchemaError(
            f"Unable to read manifest {manifest_path}: {error}"
        ) from error
    if not isinstance(raw, dict) or not isinstance(raw.get("annotations"), list):
        raise DatasetSchemaError("Manifest must contain an annotations list.")
    annotations = tuple(
        CanonicalAnnotation.from_dict(annotation)
        for annotation in raw["annotations"]
        if isinstance(annotation, dict)
    )
    if len(annotations) != len(raw["annotations"]):
        raise DatasetSchemaError("Every manifest annotation must be an object.")
    manifest = NormalizedDatasetManifest(
        annotations=annotations,
        statistics=DatasetStatistics.from_annotations(annotations),
        schema_version=str(raw.get("schema_version", "")),
    )
    if manifest.schema_version != SCHEMA_VERSION:
        raise DatasetSchemaError(
            f"Unsupported schema version '{manifest.schema_version}'. Expected {SCHEMA_VERSION}."
        )
    manifest.validate(manifest_path.parent)
    return manifest
