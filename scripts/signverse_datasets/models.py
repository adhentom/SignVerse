"""Typed records shared by dataset adapters and the merge pipeline."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

SourceType = Literal["csv", "json", "mp4", "folder"]
LicenseStatus = Literal["approved", "conditional", "pending", "blocked"]


@dataclass(frozen=True, slots=True)
class DatasetSource:
    id: str
    type: SourceType
    path: Path
    enabled: bool
    license_status: LicenseStatus
    license: str
    source_url: str
    attribution: str
    review_status: str
    language: str
    region: str
    record_kind: str = "vocabulary"
    media_glob: str = "**/*.mp4"
    columns: dict[str, str] = field(default_factory=dict)
    permission_reference: str = ""


@dataclass(frozen=True, slots=True)
class CatalogRecord:
    source_id: str
    identifier: str
    label: str
    source_url: str


@dataclass(frozen=True, slots=True)
class CandidateAsset:
    candidate_id: str
    token_id: str
    asset_id: str
    canonical_gloss: str
    word: str
    category: str
    language: str
    region: str
    version: str
    synonyms: tuple[str, ...]
    aliases: tuple[str, ...]
    alternate_spellings: tuple[str, ...]
    source_id: str
    source_url: str
    attribution: str
    license: str
    license_status: LicenseStatus
    review_status: str
    confidence_score: float
    media_path: Path | None = None
    media_sha256: str = ""
    duration: float = 1.2
    animation_available: bool = False
    animation_clip: str = ""
    issues: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class SourceInventory:
    source: DatasetSource
    candidates: tuple[CandidateAsset, ...] = ()
    catalog_records: tuple[CatalogRecord, ...] = ()
    issues: tuple[str, ...] = ()
