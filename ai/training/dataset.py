"""PyTorch dataset for normalized SignVerse landmark sequences."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Collection, Mapping, Sequence

import numpy as np
import torch
from numpy.typing import NDArray
from torch.utils.data import Dataset

from ai.datasets.schema import CanonicalAnnotation, Split, load_manifest
from ai.preprocessing.landmark_schema import DEFAULT_LANDMARK_SCHEMA

from .label_encoder import LabelEncoder, LabelEncoderError

LOGGER = logging.getLogger("signverse.training.dataset")


class LandmarkDatasetError(RuntimeError):
    """Raised when landmark files or metadata cannot form a valid dataset."""


@dataclass(frozen=True, slots=True)
class LandmarkSample:
    """Validated on-disk landmark sample indexed without loading all frames."""

    id: str
    landmark_path: Path
    metadata_path: Path
    label: str
    dataset: str
    language: str | None
    split: Split
    frames: int
    features: int
    metadata: Mapping[str, object]


@dataclass(frozen=True, slots=True)
class DatasetAudit:
    """Index-time problems retained for quality reports in permissive mode."""

    missing_landmark_ids: tuple[str, ...] = ()
    missing_metadata_ids: tuple[str, ...] = ()
    invalid_samples: Mapping[str, str] = field(default_factory=dict)

    @property
    def has_errors(self) -> bool:
        """Return whether any manifest sample failed indexing."""
        return bool(
            self.missing_landmark_ids
            or self.missing_metadata_ids
            or self.invalid_samples
        )


@dataclass(frozen=True, slots=True)
class LandmarkDatasetItem:
    """One tensor sequence and its training target/provenance."""

    landmarks: torch.Tensor
    label_id: int
    label: str
    sample_id: str
    dataset: str
    language: str | None
    split: Split
    metadata: Mapping[str, object]


class LandmarkDataset(Dataset[LandmarkDatasetItem]):
    """Load validated ``(frames, features)`` landmark arrays on demand.

    The normalized manifest is authoritative for labels, datasets, and splits.
    Landmark JSON metadata supplies optional fields such as ``language``. When
    ``strict`` is false, incomplete samples are skipped and exposed via
    :attr:`audit` so dataset statistics can report them.
    """

    def __init__(
        self,
        normalized_root: str | Path = Path("data/normalized"),
        landmarks_root: str | Path = Path("data/landmarks"),
        *,
        label_encoder: LabelEncoder | None = None,
        datasets: str | Collection[str] | None = None,
        languages: str | Collection[str] | None = None,
        splits: Split | Collection[Split] | None = None,
        expected_features: int = DEFAULT_LANDMARK_SCHEMA.vector_size,
        strict: bool = True,
    ) -> None:
        """Index landmark files and apply optional case-insensitive filters."""
        super().__init__()
        if expected_features <= 0:
            raise ValueError("expected_features must be positive.")
        self.normalized_root = Path(normalized_root).expanduser().resolve()
        self.landmarks_root = Path(landmarks_root).expanduser().resolve()
        self.expected_features = expected_features
        manifest = load_manifest(self.normalized_root / "annotations.json")
        indexed, audit = _index_samples(
            manifest.annotations, self.landmarks_root, expected_features
        )
        self.audit = audit
        if strict and audit.has_errors:
            raise LandmarkDatasetError(_format_audit_error(audit))
        if audit.has_errors:
            LOGGER.warning(_format_audit_error(audit))

        try:
            self.label_encoder = label_encoder or LabelEncoder.fit(
                annotation.label for annotation in manifest.annotations
            )
            for sample in indexed:
                self.label_encoder.encode(sample.label)
        except LabelEncoderError as error:
            raise LandmarkDatasetError(str(error)) from error

        dataset_filter = _normalize_filter(datasets)
        language_filter = _normalize_filter(languages)
        split_filter = _normalize_filter(splits)
        self.samples = tuple(
            sample
            for sample in indexed
            if _matches(sample.dataset, dataset_filter)
            and _matches(sample.language, language_filter)
            and _matches(sample.split, split_filter)
        )
        if not self.samples and strict:
            raise LandmarkDatasetError(
                "No valid landmark samples matched the requested filters."
            )

    def __len__(self) -> int:
        """Return the number of filtered landmark samples."""
        return len(self.samples)

    def __getitem__(self, index: int) -> LandmarkDatasetItem:
        """Load one sequence as a float32 PyTorch tensor."""
        sample = self.samples[index]
        try:
            array = np.load(sample.landmark_path, allow_pickle=False)
        except (OSError, ValueError) as error:
            raise LandmarkDatasetError(
                f"Unable to load landmark sample '{sample.id}': {error}"
            ) from error
        _validate_array(array, sample.id, self.expected_features)
        landmarks = torch.from_numpy(np.array(array, dtype=np.float32, copy=True))
        return LandmarkDatasetItem(
            landmarks=landmarks,
            label_id=self.label_encoder.encode(sample.label),
            label=sample.label,
            sample_id=sample.id,
            dataset=sample.dataset,
            language=sample.language,
            split=sample.split,
            metadata=sample.metadata,
        )


def _index_samples(
    annotations: Sequence[CanonicalAnnotation],
    landmarks_root: Path,
    expected_features: int,
) -> tuple[list[LandmarkSample], DatasetAudit]:
    arrays = _files_by_sample_id(landmarks_root, ".npy")
    metadata_files = _files_by_sample_id(landmarks_root, ".json")
    samples: list[LandmarkSample] = []
    missing_arrays: list[str] = []
    missing_metadata: list[str] = []
    invalid: dict[str, str] = {}
    for annotation in annotations:
        landmark_path = arrays.get(annotation.id)
        metadata_path = metadata_files.get(annotation.id)
        if landmark_path is None:
            missing_arrays.append(annotation.id)
            continue
        if metadata_path is None:
            missing_metadata.append(annotation.id)
            continue
        try:
            metadata = _read_metadata(metadata_path)
            _validate_metadata(metadata, annotation)
            array = np.load(landmark_path, mmap_mode="r", allow_pickle=False)
            _validate_array(array, annotation.id, expected_features)
            frames, features = int(array.shape[0]), int(array.shape[1])
            metadata_frames = metadata.get("frames")
            if metadata_frames is not None:
                if not isinstance(metadata_frames, (int, float, str)):
                    raise LandmarkDatasetError("metadata frames must be numeric.")
                if int(metadata_frames) != frames:
                    raise LandmarkDatasetError(
                        f"metadata declares {metadata_frames} frames but array has {frames}."
                    )
            language_value = metadata.get("language")
            language = (
                str(language_value).strip() if language_value is not None else None
            )
            samples.append(
                LandmarkSample(
                    id=annotation.id,
                    landmark_path=landmark_path,
                    metadata_path=metadata_path,
                    label=annotation.label,
                    dataset=annotation.dataset,
                    language=language or None,
                    split=annotation.split,
                    frames=frames,
                    features=features,
                    metadata=metadata,
                )
            )
        except (
            OSError,
            ValueError,
            json.JSONDecodeError,
            LandmarkDatasetError,
        ) as error:
            invalid[annotation.id] = str(error)
    return samples, DatasetAudit(
        missing_landmark_ids=tuple(missing_arrays),
        missing_metadata_ids=tuple(missing_metadata),
        invalid_samples=invalid,
    )


def _files_by_sample_id(root: Path, suffix: str) -> dict[str, Path]:
    if not root.is_dir():
        return {}
    indexed: dict[str, Path] = {}
    for path in sorted(root.rglob(f"*{suffix}")):
        sample_id = path.stem.removeprefix("sample_")
        if sample_id in indexed:
            raise LandmarkDatasetError(
                f"Multiple {suffix} files resolve to sample ID '{sample_id}'."
            )
        indexed[sample_id] = path
    return indexed


def _read_metadata(path: Path) -> dict[str, object]:
    raw: Any = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise LandmarkDatasetError(f"Landmark metadata must be an object: {path}")
    return {str(key): value for key, value in raw.items()}


def _validate_metadata(
    metadata: Mapping[str, object], annotation: CanonicalAnnotation
) -> None:
    for metadata_field, expected in (
        ("label", annotation.label),
        ("dataset", annotation.dataset),
    ):
        actual = metadata.get(metadata_field)
        if actual is not None and str(actual) != expected:
            raise LandmarkDatasetError(
                f"metadata {metadata_field} {actual!r} does not match manifest {expected!r}."
            )


def _validate_array(
    array: NDArray[np.generic], sample_id: str, expected_features: int
) -> None:
    if array.ndim != 2:
        raise LandmarkDatasetError(
            f"Landmark sample '{sample_id}' must be two-dimensional, got {array.shape}."
        )
    if array.shape[0] <= 0:
        raise LandmarkDatasetError(f"Landmark sample '{sample_id}' contains no frames.")
    if array.shape[1] != expected_features:
        raise LandmarkDatasetError(
            f"Landmark sample '{sample_id}' must have {expected_features} features, "
            f"got {array.shape[1]}."
        )
    if not np.issubdtype(array.dtype, np.number):
        raise LandmarkDatasetError(
            f"Landmark sample '{sample_id}' must contain numeric values."
        )


def _normalize_filter(values: object) -> frozenset[str] | None:
    if values is None:
        return None
    candidates: tuple[str, ...]
    if isinstance(values, str):
        candidates = (values,)
    elif isinstance(values, Collection):
        candidates = tuple(str(value) for value in values)
    else:
        candidates = (str(values),)
    normalized = frozenset(
        value.strip().casefold() for value in candidates if value.strip()
    )
    return normalized or None


def _matches(value: str | None, allowed: frozenset[str] | None) -> bool:
    return allowed is None or (value is not None and value.casefold() in allowed)


def _format_audit_error(audit: DatasetAudit) -> str:
    parts = ["Landmark dataset is incomplete or invalid."]
    if audit.missing_landmark_ids:
        parts.append(f"Missing arrays: {', '.join(audit.missing_landmark_ids)}.")
    if audit.missing_metadata_ids:
        parts.append(f"Missing metadata: {', '.join(audit.missing_metadata_ids)}.")
    if audit.invalid_samples:
        details = "; ".join(
            f"{sample_id}: {message}"
            for sample_id, message in sorted(audit.invalid_samples.items())
        )
        parts.append(f"Invalid samples: {details}.")
    return " ".join(parts)
