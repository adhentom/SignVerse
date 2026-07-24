"""Filesystem adapter for a manually installed NISH dataset."""

from ..dataset_manager import FilesystemVideoDatasetAdapter


class NISHDatasetAdapter(FilesystemVideoDatasetAdapter):
    """Discover raw videos in a locally installed NISH dataset."""

    dataset_name = "nish"
