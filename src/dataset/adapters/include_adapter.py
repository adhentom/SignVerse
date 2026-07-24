"""Filesystem adapter for the INCLUDE Indian Sign Language dataset."""

from ..dataset_manager import FilesystemVideoDatasetAdapter


class INCLUDEDatasetAdapter(FilesystemVideoDatasetAdapter):
    """Discover raw videos in a locally installed INCLUDE dataset."""

    dataset_name = "include"
