"""Dataset source configuration loading and validation."""

from __future__ import annotations

import json
from pathlib import Path
from typing import cast

from .models import DatasetSource, LicenseStatus, SourceType

SOURCE_TYPES = {"csv", "json", "mp4", "folder"}
LICENSE_STATUSES = {"approved", "conditional", "pending", "blocked"}
ISL_LANGUAGE_NAMES = {"isl", "indian sign language"}


def load_sources(path: Path, repository: Path) -> tuple[DatasetSource, ...]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if raw.get("schema_version") != "1.0" or not isinstance(raw.get("sources"), list):
        raise ValueError(
            "Dataset configuration must use schema_version 1.0 and sources[]."
        )
    seen: set[str] = set()
    sources: list[DatasetSource] = []
    for item in raw["sources"]:
        if not isinstance(item, dict):
            raise ValueError("Every dataset source must be an object.")
        source_id = _required(item, "id")
        if source_id in seen:
            raise ValueError(f"Duplicate dataset source ID: {source_id}")
        seen.add(source_id)
        source_type = _required(item, "type")
        license_status = _required(item, "license_status")
        language = _required(item, "language")
        region = _required(item, "region")
        if source_type not in SOURCE_TYPES:
            raise ValueError(f"Unsupported dataset source type: {source_type}")
        if license_status not in LICENSE_STATUSES:
            raise ValueError(f"Unsupported license status: {license_status}")
        if (
            language.casefold() not in ISL_LANGUAGE_NAMES
            or region.casefold() != "india"
        ):
            raise ValueError(
                f"Dataset source {source_id} is not Indian Sign Language from India. "
                "SignVerse excludes Indo-Pakistani and other sign-language datasets."
            )
        configured_path = Path(_required(item, "path"))
        sources.append(
            DatasetSource(
                id=source_id,
                type=cast(SourceType, source_type),
                path=configured_path
                if configured_path.is_absolute()
                else repository / configured_path,
                enabled=bool(item.get("enabled", True)),
                license_status=cast(LicenseStatus, license_status),
                license=_required(item, "license"),
                source_url=str(item.get("source_url", "")).strip(),
                attribution=str(item.get("attribution", "")).strip(),
                review_status=str(item.get("review_status", "candidate")).strip(),
                language=language,
                region=region,
                record_kind=str(item.get("record_kind", "vocabulary")).strip(),
                media_glob=str(item.get("media_glob", "**/*.mp4")).strip(),
                columns={
                    str(key): str(value).strip()
                    for key, value in item.get("columns", {}).items()
                },
                permission_reference=str(item.get("permission_reference", "")).strip(),
            )
        )
    return tuple(sources)


def _required(item: dict[str, object], key: str) -> str:
    value = str(item.get(key, "")).strip()
    if not value:
        raise ValueError(f"Dataset source is missing {key}.")
    return value
