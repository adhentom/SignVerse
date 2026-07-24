"""Quality and balance statistics for landmark training datasets."""

from __future__ import annotations

import json
from collections import Counter
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np

from ai.preprocessing.landmark_schema import DEFAULT_LANDMARK_SCHEMA

from .dataset import LandmarkDataset


@dataclass(frozen=True, slots=True)
class ClassImbalanceReport:
    """Summary of the class-count spread in a dataset."""

    minimum_samples: int
    maximum_samples: int
    imbalance_ratio: float
    underrepresented_classes: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class MissingLandmarkReport:
    """Missing files and absent/non-finite frame landmark groups."""

    missing_files: tuple[str, ...]
    missing_metadata: tuple[str, ...]
    invalid_files: dict[str, str]
    non_finite_values: int
    total_frames: int
    left_hand_missing_frames: int
    right_hand_missing_frames: int
    pose_missing_frames: int


@dataclass(frozen=True, slots=True)
class LandmarkStatistics:
    """Training-data distribution and landmark quality statistics."""

    total_samples: int
    samples_per_class: dict[str, int]
    sequence_length_histogram: dict[int, int]
    average_sequence_length: float
    class_imbalance: ClassImbalanceReport
    missing_landmarks: MissingLandmarkReport

    def to_dict(self) -> dict[str, object]:
        """Return a JSON-compatible statistics mapping."""
        return asdict(self)


def generate_statistics(dataset: LandmarkDataset) -> LandmarkStatistics:
    """Scan indexed arrays and calculate balance, length, and missingness reports."""
    class_counts = Counter(sample.label for sample in dataset.samples)
    length_counts = Counter(sample.frames for sample in dataset.samples)
    total_frames = 0
    non_finite = 0
    left_missing = 0
    right_missing = 0
    pose_missing = 0
    schema = DEFAULT_LANDMARK_SCHEMA
    for sample in dataset.samples:
        sequence = np.load(sample.landmark_path, mmap_mode="r", allow_pickle=False)
        total_frames += int(sequence.shape[0])
        non_finite += int(np.count_nonzero(~np.isfinite(sequence)))
        left_missing += int(
            np.count_nonzero(
                np.all(
                    sequence[:, schema.left_hand_offset : schema.right_hand_offset]
                    == 0,
                    axis=1,
                )
            )
        )
        right_missing += int(
            np.count_nonzero(
                np.all(
                    sequence[:, schema.right_hand_offset : schema.pose_offset] == 0,
                    axis=1,
                )
            )
        )
        pose_missing += int(
            np.count_nonzero(np.all(sequence[:, schema.pose_offset :] == 0, axis=1))
        )

    counts = tuple(class_counts.values())
    minimum = min(counts) if counts else 0
    maximum = max(counts) if counts else 0
    average_class_size = sum(counts) / len(counts) if counts else 0.0
    imbalance = ClassImbalanceReport(
        minimum_samples=minimum,
        maximum_samples=maximum,
        imbalance_ratio=round(maximum / minimum, 6) if minimum else 0.0,
        underrepresented_classes=tuple(
            sorted(
                label
                for label, count in class_counts.items()
                if count < average_class_size
            )
        ),
    )
    missing = MissingLandmarkReport(
        missing_files=dataset.audit.missing_landmark_ids,
        missing_metadata=dataset.audit.missing_metadata_ids,
        invalid_files=dict(dataset.audit.invalid_samples),
        non_finite_values=non_finite,
        total_frames=total_frames,
        left_hand_missing_frames=left_missing,
        right_hand_missing_frames=right_missing,
        pose_missing_frames=pose_missing,
    )
    return LandmarkStatistics(
        total_samples=len(dataset),
        samples_per_class=dict(sorted(class_counts.items())),
        sequence_length_histogram=dict(sorted(length_counts.items())),
        average_sequence_length=round(total_frames / len(dataset), 6)
        if len(dataset)
        else 0.0,
        class_imbalance=imbalance,
        missing_landmarks=missing,
    )


def save_statistics(statistics: LandmarkStatistics, path: str | Path) -> None:
    """Atomically save generated landmark statistics as JSON."""
    destination = Path(path).expanduser().resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name(f".{destination.name}.tmp")
    try:
        temporary.write_text(
            json.dumps(statistics.to_dict(), indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)
