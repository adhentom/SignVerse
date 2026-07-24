"""Stable train/validation/test views over a landmark dataset."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Collection

from torch.utils.data import Subset

from ai.preprocessing.landmark_schema import DEFAULT_LANDMARK_SCHEMA

from .dataset import LandmarkDataset, LandmarkDatasetItem
from .label_encoder import LabelEncoder


@dataclass(frozen=True, slots=True)
class LandmarkDatasetSplits:
    """PyTorch subsets sharing one dataset and label vocabulary."""

    train: Subset[LandmarkDatasetItem]
    validation: Subset[LandmarkDatasetItem]
    test: Subset[LandmarkDatasetItem]
    label_encoder: LabelEncoder


def create_dataset_splits(
    normalized_root: str | Path = Path("data/normalized"),
    landmarks_root: str | Path = Path("data/landmarks"),
    *,
    datasets: str | Collection[str] | None = None,
    languages: str | Collection[str] | None = None,
    expected_features: int = DEFAULT_LANDMARK_SCHEMA.vector_size,
    strict: bool = True,
) -> LandmarkDatasetSplits:
    """Create manifest-defined split subsets with a shared label encoder."""
    dataset = LandmarkDataset(
        normalized_root,
        landmarks_root,
        datasets=datasets,
        languages=languages,
        expected_features=expected_features,
        strict=strict,
    )
    indices = {
        split: [
            index
            for index, sample in enumerate(dataset.samples)
            if sample.split == split
        ]
        for split in ("train", "validation", "test")
    }
    return LandmarkDatasetSplits(
        train=Subset(dataset, indices["train"]),
        validation=Subset(dataset, indices["validation"]),
        test=Subset(dataset, indices["test"]),
        label_encoder=dataset.label_encoder,
    )
