"""Filesystem adapter for a manually installed MUDRA dataset."""

from ..dataset_manager import FilesystemVideoDatasetAdapter


class MUDRADatasetAdapter(FilesystemVideoDatasetAdapter):
    """Discover raw videos in a locally installed MUDRA dataset."""

    dataset_name = "mudra"
