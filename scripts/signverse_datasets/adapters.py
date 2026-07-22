"""Adapters that normalize CSV, JSON, MP4, and folder sources."""

from __future__ import annotations

import csv
import hashlib
import json
from pathlib import Path
from typing import Any

from .models import CandidateAsset, CatalogRecord, DatasetSource, SourceInventory
from .normalization import slug


def inspect_source(source: DatasetSource) -> SourceInventory:
    if not source.enabled:
        return SourceInventory(source, issues=("source disabled",))
    if not source.path.exists():
        return SourceInventory(
            source, issues=(f"source path not found: {source.path}",)
        )
    if source.type == "csv":
        return _inspect_csv(source)
    if source.type == "json":
        return _inspect_json(source)
    if source.type == "mp4":
        return SourceInventory(
            source, candidates=(_candidate_from_media(source.path, source),)
        )
    return _inspect_folder(source)


def _inspect_csv(source: DatasetSource) -> SourceInventory:
    with source.path.open(encoding="utf-8-sig", newline="") as input_file:
        rows = list(csv.DictReader(input_file))
    if source.record_kind == "catalog":
        return SourceInventory(
            source,
            catalog_records=tuple(
                CatalogRecord(
                    source_id=source.id,
                    identifier=_column(row, source, "identifier"),
                    label=_column(row, source, "label"),
                    source_url=_column(row, source, "source_url"),
                )
                for row in rows
            ),
        )
    candidates = tuple(
        _candidate_from_mapping(row, source, index) for index, row in enumerate(rows, 1)
    )
    return SourceInventory(source, candidates=candidates)


def _inspect_json(source: DatasetSource) -> SourceInventory:
    raw = json.loads(source.path.read_text(encoding="utf-8"))
    entries = raw.get("entries", []) if isinstance(raw, dict) else raw
    if not isinstance(entries, list):
        raise ValueError(
            f"JSON dataset must be a list or contain entries[]: {source.path}"
        )
    candidates = tuple(
        _candidate_from_mapping(entry, source, index)
        for index, entry in enumerate(entries, 1)
        if isinstance(entry, dict)
    )
    return SourceInventory(source, candidates=candidates)


def _inspect_folder(source: DatasetSource) -> SourceInventory:
    paths = sorted(
        path for path in source.path.glob(source.media_glob) if path.is_file()
    )
    return SourceInventory(
        source,
        candidates=tuple(_candidate_from_media(path, source) for path in paths),
    )


def _candidate_from_media(path: Path, source: DatasetSource) -> CandidateAsset:
    metadata_path = path.parent / "metadata.json"
    metadata: dict[str, Any] = {}
    issues: list[str] = []
    if metadata_path.is_file():
        raw = json.loads(metadata_path.read_text(encoding="utf-8"))
        if isinstance(raw, dict):
            metadata = raw
    else:
        issues.append("metadata.json missing; filename-derived gloss requires review")
    word = str(
        metadata.get("word") or metadata.get("display_name") or path.stem
    ).strip()
    sign_slug = slug(word)
    source_id = str(metadata.get("source_id") or source.id)
    clip_path = path.parent / "AnimationClip.json"
    return CandidateAsset(
        candidate_id=f"{source.id}:{path.relative_to(source.path) if source.path.is_dir() else path.name}",
        token_id=str(metadata.get("token_id") or f"{slug(source.id)}-{sign_slug}"),
        asset_id=str(metadata.get("asset_id") or f"{slug(source.id)}-{sign_slug}-v1"),
        canonical_gloss=str(metadata.get("canonical_gloss") or word).strip().upper(),
        word=word,
        category=str(metadata.get("category") or "general").strip(),
        language=str(metadata.get("language") or "ISL").strip(),
        region=str(metadata.get("region") or "India").strip(),
        version=str(metadata.get("version") or "1.0").strip(),
        synonyms=_strings(metadata.get("synonyms")),
        aliases=_strings(metadata.get("aliases")),
        alternate_spellings=_strings(metadata.get("alternate_spellings")),
        source_id=source_id,
        source_url=str(metadata.get("source_url") or source.source_url).strip(),
        attribution=str(metadata.get("attribution") or source.attribution).strip(),
        license=str(metadata.get("license") or source.license).strip(),
        license_status=source.license_status,
        review_status=str(
            metadata.get("review_status") or source.review_status
        ).strip(),
        confidence_score=_confidence(metadata),
        media_path=path,
        media_sha256=_sha256(path),
        duration=float(metadata.get("duration", 1.2)),
        animation_available=clip_path.is_file(),
        animation_clip=str(clip_path) if clip_path.is_file() else "",
        issues=tuple(issues),
    )


def _candidate_from_mapping(
    row: dict[str, Any], source: DatasetSource, position: int
) -> CandidateAsset:
    canonical = _mapped(row, source, "canonical_gloss") or _mapped(row, source, "word")
    issues = () if canonical else ("canonical gloss missing",)
    word = _mapped(row, source, "word") or canonical
    sign_slug = slug(canonical) or f"row-{position}"
    media_value = _mapped(row, source, "file_path")
    media = source.path.parent / media_value if media_value else None
    return CandidateAsset(
        candidate_id=f"{source.id}:row-{position}",
        token_id=_mapped(row, source, "token_id") or f"{slug(source.id)}-{sign_slug}",
        asset_id=_mapped(row, source, "asset_id")
        or f"{slug(source.id)}-{sign_slug}-v1",
        canonical_gloss=canonical.upper(),
        word=word,
        category=_mapped(row, source, "category") or "general",
        language=_mapped(row, source, "language") or "ISL",
        region=_mapped(row, source, "region") or "India",
        version=_mapped(row, source, "version") or "1.0",
        synonyms=_split(_mapped(row, source, "synonyms")),
        aliases=_split(_mapped(row, source, "aliases")),
        alternate_spellings=_split(_mapped(row, source, "alternate_spellings")),
        source_id=source.id,
        source_url=_mapped(row, source, "source_url") or source.source_url,
        attribution=source.attribution,
        license=source.license,
        license_status=source.license_status,
        review_status=_mapped(row, source, "review_status") or source.review_status,
        confidence_score=0.5,
        media_path=media if media and media.is_file() else None,
        media_sha256=_sha256(media) if media and media.is_file() else "",
        issues=issues,
    )


def _column(row: dict[str, str], source: DatasetSource, field: str) -> str:
    column = source.columns.get(field, field)
    return str(row.get(column, "")).strip()


def _mapped(row: dict[str, Any], source: DatasetSource, field: str) -> str:
    column = source.columns.get(field, field)
    return str(row.get(column, "")).strip()


def _strings(value: object) -> tuple[str, ...]:
    if not isinstance(value, list):
        return ()
    return tuple(
        dict.fromkeys(str(item).strip() for item in value if str(item).strip())
    )


def _split(value: str) -> tuple[str, ...]:
    return tuple(
        dict.fromkeys(part.strip() for part in value.split("|") if part.strip())
    )


def _confidence(metadata: dict[str, Any]) -> float:
    if "confidence_score" in metadata:
        return max(0.0, min(1.0, float(metadata["confidence_score"])))
    return 1.0 if metadata.get("review_status") == "approved" else 0.5


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()
