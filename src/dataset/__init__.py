"""Dataset registration and adapter contracts for SignVerse AI."""

from .dataset_manager import (
    BaseDatasetAdapter,
    DatasetManager,
    DatasetManagerError,
    DatasetMetadata,
    DatasetNotRegisteredError,
    DatasetPathError,
    DatasetRegistration,
    FilesystemVideoDatasetAdapter,
)

__all__ = [
    "BaseDatasetAdapter",
    "DatasetManager",
    "DatasetManagerError",
    "DatasetMetadata",
    "DatasetNotRegisteredError",
    "DatasetPathError",
    "DatasetRegistration",
    "FilesystemVideoDatasetAdapter",
]
