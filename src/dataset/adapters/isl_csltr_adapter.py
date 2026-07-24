"""Filesystem adapter for the ISL-CSLTR sign-language dataset."""

from ..dataset_manager import FilesystemVideoDatasetAdapter


class ISLCSLTRDatasetAdapter(FilesystemVideoDatasetAdapter):
    """Discover raw videos in a locally installed ISL-CSLTR dataset."""

    dataset_name = "isl-csltr"
