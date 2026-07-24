"""Filesystem adapter for the iSign Indian Sign Language dataset."""

from ..dataset_manager import FilesystemVideoDatasetAdapter


class ISignDatasetAdapter(FilesystemVideoDatasetAdapter):
    """Discover raw videos in a locally installed iSign dataset."""

    dataset_name = "isign"
