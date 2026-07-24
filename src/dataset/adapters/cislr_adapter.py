"""Filesystem adapter for the CISLR sign-language dataset."""

from ..dataset_manager import FilesystemVideoDatasetAdapter


class CISLRDatasetAdapter(FilesystemVideoDatasetAdapter):
    """Discover raw videos in a locally installed CISLR dataset."""

    dataset_name = "cislr"
