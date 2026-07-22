"""Dataset analysis, vocabulary merge, reporting, and governed promotion."""

from __future__ import annotations

import json
import shutil
from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

from .adapters import inspect_source
from .config import load_sources
from .models import CandidateAsset, SourceInventory
from .normalization import normalize_term

CATEGORY_MAP = {
    "greetings": "Greetings",
    "education": "Education",
    "technology": "Technology",
    "government": "Government",
    "healthcare": "Healthcare",
    "numbers": "Numbers",
    "time": "Time",
    "actions": "Actions",
    "people": "People",
    "objects": "Objects",
    "fingerspelling": "Fingerspelling",
    "general": "General",
}


@dataclass(frozen=True, slots=True)
class PipelineResult:
    sources: int
    candidates: int
    catalog_records: int
    base_vocabulary: int
    merged_vocabulary: int
    new_vocabulary: int
    duplicate_gloss_groups: int
    duplicate_media_groups: int
    duplicate_asset_ids: int
    duplicate_token_ids: int
    ambiguous_aliases: int
    invalid_candidates: int
    animations: int
    mp4_fallbacks: int


class DatasetPipeline:
    def __init__(self, repository: Path, config_path: Path) -> None:
        self.repository = repository.resolve()
        self.config_path = config_path.resolve()
        self.sources = load_sources(self.config_path, self.repository)

    def run(self, *, write: bool = True) -> PipelineResult:
        inventories = tuple(inspect_source(source) for source in self.sources)
        candidates = tuple(
            candidate for inventory in inventories for candidate in inventory.candidates
        )
        catalogs = tuple(
            record for inventory in inventories for record in inventory.catalog_records
        )
        base_path = self.repository / "apps/api/resources/lexicon/lexicon.json"
        base_document = json.loads(base_path.read_text(encoding="utf-8"))
        merged, rich, ambiguous = _merge_vocabulary(base_document, candidates)
        duplicate_glosses = _duplicates(
            candidates, lambda item: normalize_term(item.word)
        )
        duplicate_media = _duplicates(candidates, lambda item: item.media_sha256)
        duplicate_asset_ids = _duplicates(
            candidates, lambda item: item.asset_id.casefold()
        )
        duplicate_token_ids = _duplicates(
            candidates, lambda item: item.token_id.casefold()
        )
        result = PipelineResult(
            sources=len(inventories),
            candidates=len(candidates),
            catalog_records=len(catalogs),
            base_vocabulary=len(base_document["entries"]),
            merged_vocabulary=len(merged["entries"]),
            new_vocabulary=len(merged["entries"]) - len(base_document["entries"]),
            duplicate_gloss_groups=len(duplicate_glosses),
            duplicate_media_groups=len(duplicate_media),
            duplicate_asset_ids=len(duplicate_asset_ids),
            duplicate_token_ids=len(duplicate_token_ids),
            ambiguous_aliases=len(ambiguous),
            invalid_candidates=sum(bool(candidate.issues) for candidate in candidates),
            animations=sum(candidate.animation_available for candidate in candidates),
            mp4_fallbacks=sum(
                candidate.media_path is not None and not candidate.animation_available
                for candidate in candidates
            ),
        )
        if write:
            self._write_outputs(
                inventories,
                candidates,
                catalogs,
                merged,
                rich,
                ambiguous,
                duplicate_glosses,
                duplicate_media,
                duplicate_asset_ids,
                duplicate_token_ids,
                result,
            )
        return result

    def promote(self, source_id: str, *, convert: bool = False) -> int:
        source = next((item for item in self.sources if item.id == source_id), None)
        if source is None:
            raise ValueError(f"Unknown dataset source: {source_id}")
        if not source.enabled:
            raise ValueError(f"Dataset source is disabled: {source_id}")
        if source.license_status != "approved" or not source.permission_reference:
            raise PermissionError(
                "Promotion requires license_status=approved and a permission_reference."
            )
        inventory = inspect_source(source)
        eligible = [
            candidate
            for candidate in inventory.candidates
            if candidate.media_path is not None
            and candidate.review_status in {"approved", "governed"}
            and not candidate.issues
        ]
        for candidate in eligible:
            self._promote_candidate(candidate)
        if convert and eligible:
            from signverse_animation.converter import convert_all

            convert_all(
                self.repository / "assets/signs",
                self.repository / "apps/chrome-extension/public/animations",
                self.repository / "apps/chrome-extension/playback/animationAssets.json",
            )
        return len(eligible)

    def _promote_candidate(self, candidate: CandidateAsset) -> None:
        assert candidate.media_path is not None
        asset_directory = self.repository / "assets/signs" / candidate.token_id
        extension_video = (
            self.repository
            / "apps/chrome-extension/public/signs"
            / f"{candidate.asset_id}.mp4"
        )
        if asset_directory.exists() or extension_video.exists():
            raise FileExistsError(
                f"Refusing to overwrite existing asset: {candidate.token_id}"
            )
        asset_directory.mkdir(parents=True)
        backend_video = asset_directory / f"{candidate.asset_id}.mp4"
        shutil.copy2(candidate.media_path, backend_video)
        extension_video.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(candidate.media_path, extension_video)
        metadata = {
            "token_id": candidate.token_id,
            "asset_id": candidate.asset_id,
            "display_name": candidate.word,
            "category": candidate.category,
            "review_status": candidate.review_status,
            "animation_type": "mp4",
            "canonical_gloss": candidate.canonical_gloss,
            "word": candidate.word,
            "synonyms": list(candidate.synonyms),
            "aliases": list(candidate.aliases),
            "alternate_spellings": list(candidate.alternate_spellings),
            "language": candidate.language,
            "region": candidate.region,
            "license": candidate.license,
            "license_status": candidate.license_status,
            "source_id": candidate.source_id,
            "source_url": candidate.source_url,
            "attribution": candidate.attribution,
            "confidence_score": candidate.confidence_score,
            "duration": candidate.duration,
            "version": candidate.version,
        }
        (asset_directory / "metadata.json").write_text(
            json.dumps(metadata, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        self._append_extension_asset(candidate, extension_video)

    def _append_extension_asset(
        self, candidate: CandidateAsset, extension_video: Path
    ) -> None:
        manifest_path = (
            self.repository / "apps/chrome-extension/playback/datasetAssets.json"
        )
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if any(item.get("asset_id") == candidate.asset_id for item in manifest):
            raise FileExistsError(
                f"Extension asset already exists: {candidate.asset_id}"
            )
        manifest.append(
            {
                "asset_id": candidate.asset_id,
                "token_id": candidate.token_id,
                "canonical_gloss": candidate.canonical_gloss,
                "word": candidate.word,
                "synonyms": list(candidate.synonyms),
                "aliases": list(candidate.aliases),
                "alternate_spellings": list(candidate.alternate_spellings),
                "language": candidate.language,
                "category": candidate.category,
                "display_name": candidate.word,
                "format": "mp4",
                "file_path": f"signs/{extension_video.name}",
                "source": f"signs/{extension_video.name}",
                "duration": candidate.duration,
                "license": candidate.license,
                "version": candidate.version,
                "review_status": candidate.review_status,
                "transition": "cut",
                "handshape": "validated source media; linguistic annotation pending",
                "orientation": "validated source media; linguistic annotation pending",
                "facial_expression": "validated source media; linguistic annotation pending",
                "fallback": "sign-unavailable",
                "metadata": {
                    "source_id": candidate.source_id,
                    "source_url": candidate.source_url,
                    "attribution": candidate.attribution,
                    "confidence_score": candidate.confidence_score,
                    "media_sha256": candidate.media_sha256,
                },
            }
        )
        manifest.sort(key=lambda item: str(item["asset_id"]))
        manifest_path.write_text(
            json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )

    def _write_outputs(
        self,
        inventories: tuple[SourceInventory, ...],
        candidates: tuple[CandidateAsset, ...],
        catalogs: tuple[object, ...],
        merged: dict[str, Any],
        rich: dict[str, Any],
        ambiguous: dict[str, list[str]],
        duplicate_glosses: dict[str, list[CandidateAsset]],
        duplicate_media: dict[str, list[CandidateAsset]],
        duplicate_asset_ids: dict[str, list[CandidateAsset]],
        duplicate_token_ids: dict[str, list[CandidateAsset]],
        result: PipelineResult,
    ) -> None:
        lexicon_root = self.repository / "apps/api/resources/lexicon"
        (lexicon_root / "lexicon.generated.json").write_text(
            json.dumps(merged, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        (lexicon_root / "unified_vocabulary.json").write_text(
            json.dumps(rich, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        index = {
            candidate.asset_id: _asset_index_record(candidate)
            for candidate in sorted(candidates, key=lambda item: item.asset_id)
        }
        (self.repository / "assets/signs/index.json").write_text(
            json.dumps(index, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        self._write_reports(
            inventories,
            candidates,
            catalogs,
            ambiguous,
            duplicate_glosses,
            duplicate_media,
            duplicate_asset_ids,
            duplicate_token_ids,
            result,
        )

    def _write_reports(
        self,
        inventories: tuple[SourceInventory, ...],
        candidates: tuple[CandidateAsset, ...],
        catalogs: tuple[object, ...],
        ambiguous: dict[str, list[str]],
        duplicate_glosses: dict[str, list[CandidateAsset]],
        duplicate_media: dict[str, list[CandidateAsset]],
        duplicate_asset_ids: dict[str, list[CandidateAsset]],
        duplicate_token_ids: dict[str, list[CandidateAsset]],
        result: PipelineResult,
    ) -> None:
        root = self.repository / "docs/datasets"
        root.mkdir(parents=True, exist_ok=True)
        source_rows = "\n".join(
            f"| {item.source.id} | {item.source.type} | {item.source.license_status} | "
            f"{len(item.candidates)} | {len(item.catalog_records)} | "
            f"{'; '.join(item.issues) or 'none'} |"
            for item in inventories
        )
        (root / "DATASET_ANALYSIS.md").write_text(
            "# Dataset Analysis\n\n"
            f"Generated: {date.today().isoformat()}\n\n"
            "| Source | Type | License status | Candidates | Catalog rows | Issues |\n"
            "|---|---|---:|---:|---:|---|\n"
            f"{source_rows}\n\n"
            f"The ISLRTC CSV contributes {len(catalogs)} navigation records and zero vocabulary "
            "records because it contains folder links rather than dictionary terms. External "
            "Drive media was not scraped or downloaded.\n",
            encoding="utf-8",
        )
        duplicate_rows = (
            "\n".join(
                f"| {term} | {', '.join(item.asset_id for item in items)} |"
                for term, items in sorted(duplicate_glosses.items())
            )
            or "| none | none |"
        )
        (root / "VOCABULARY_MERGE_REPORT.md").write_text(
            "# Vocabulary Merge Report\n\n"
            f"Base entries: {result.base_vocabulary}\n\n"
            f"Merged entries: {result.merged_vocabulary}\n\n"
            f"New entries from governed asset metadata: {result.new_vocabulary}\n\n"
            f"Ambiguous aliases omitted from lookup: {result.ambiguous_aliases}\n\n"
            "## Duplicate gloss variants\n\n"
            "| Normalized gloss | Asset variants |\n|---|---|\n"
            f"{duplicate_rows}\n",
            encoding="utf-8",
        )
        (root / "COVERAGE_REPORT.md").write_text(
            "# ISL Coverage Report\n\n"
            f"- Governed MP4 candidates: {result.candidates}\n"
            f"- Landmark animation clips: {result.animations}\n"
            f"- MP4-only fallbacks: {result.mp4_fallbacks}\n"
            f"- Canonical vocabulary entries: {result.merged_vocabulary}\n"
            f"- Duplicate media hash groups: {result.duplicate_media_groups}\n"
            f"- Duplicate asset ID groups: {result.duplicate_asset_ids}\n"
            f"- Duplicate token ID groups: {result.duplicate_token_ids}\n"
            f"- Candidates with validation issues: {result.invalid_candidates}\n"
            f"- Ambiguous aliases: {result.ambiguous_aliases}\n",
            encoding="utf-8",
        )
        media_rows = (
            "\n".join(
                f"| {digest[:12]} | {', '.join(item.asset_id for item in items)} |"
                for digest, items in sorted(duplicate_media.items())
            )
            or "| none | none |"
        )
        quality = _animation_quality(candidates)
        (root / "ANIMATION_IMPORT_REPORT.md").write_text(
            "# Animation Import Report\n\n"
            "No external media was imported during this run. The existing governed library was "
            "analyzed in place. New approved local imports can invoke the existing MediaPipe "
            "converter; failed landmark quality retains MP4 playback.\n\n"
            f"Existing animation clips: {result.animations}\n\n"
            f"Existing MP4 fallbacks: {result.mp4_fallbacks}\n\n"
            f"Mean pose landmark coverage: {quality['pose']:.1%}\n\n"
            f"Mean face landmark coverage: {quality['face']:.1%}\n\n"
            f"Mean best-hand landmark coverage: {quality['hand']:.1%}\n\n"
            "## Identical media groups\n\n| SHA-256 prefix | Assets |\n|---|---|\n"
            f"{media_rows}\n",
            encoding="utf-8",
        )
        duplicate_id_summary = {
            "asset_ids": sorted(duplicate_asset_ids),
            "token_ids": sorted(duplicate_token_ids),
        }
        (root / "IMPLEMENTATION_SUMMARY.md").write_text(
            "# ISL Dataset Expansion Implementation Summary\n\n"
            "The intake layer now supports configuration-driven CSV, JSON, MP4, and folder "
            "sources. It normalizes candidates, validates governance metadata, detects duplicate "
            "glosses and media, merges governed vocabulary, and generates a non-destructive asset "
            "index. Promotion is fail-closed: it requires an approved license status, a permission "
            "reference, and an approved/governed candidate. Existing assets are never overwritten.\n\n"
            "ISLRTC Drive media remains manual-import-only until redistribution permission is "
            "recorded.\n\n"
            f"Duplicate identifier findings: `{json.dumps(duplicate_id_summary)}`.\n",
            encoding="utf-8",
        )


def _merge_vocabulary(
    base_document: dict[str, Any], candidates: tuple[CandidateAsset, ...]
) -> tuple[dict[str, Any], dict[str, Any], dict[str, list[str]]]:
    groups: list[dict[str, Any]] = [
        {"entry": dict(entry), "assets": [], "sources": []}
        for entry in base_document["entries"]
    ]
    primary: dict[str, set[int]] = defaultdict(set)
    used_ids = {str(group["entry"]["token_id"]).casefold() for group in groups}
    for index, group in enumerate(groups):
        entry = group["entry"]
        for value in (entry["concept"], entry["gloss"], *entry.get("synonyms", [])):
            primary[normalize_term(value)].add(index)
    for candidate in sorted(
        candidates,
        key=lambda item: (
            -len(item.synonyms) - len(item.aliases) - len(item.alternate_spellings),
            normalize_term(item.word),
            item.asset_id,
        ),
    ):
        terms = {
            normalize_term(candidate.word),
            normalize_term(candidate.canonical_gloss),
        } - {""}
        matches = set().union(*(primary.get(term, set()) for term in terms))
        if len(matches) == 1:
            group_index = next(iter(matches))
        else:
            existing = set().union(*(primary.get(term, set()) for term in terms))
            if existing:
                matches = existing
            token_id = _unique_token(candidate.token_id, used_ids)
            used_ids.add(token_id.casefold())
            entry = {
                "token_id": token_id,
                "concept": candidate.word,
                "gloss": candidate.canonical_gloss,
                "category": _category(candidate.category),
                "language": candidate.language,
                "region": candidate.region,
                "version": candidate.version,
                "review_status": "approved"
                if candidate.review_status == "approved"
                else "draft",
                "source": candidate.source_url or candidate.source_id,
                "license": candidate.license,
                "synonyms": [],
                "related_tokens": [],
            }
            groups.append({"entry": entry, "assets": [], "sources": []})
            group_index = len(groups) - 1
            for term in terms:
                primary[term].add(group_index)
        group = groups[group_index]
        group["assets"].append(candidate)
        group["sources"].append(
            {
                "source_id": candidate.source_id,
                "source_url": candidate.source_url,
                "license": candidate.license,
                "license_status": candidate.license_status,
                "attribution": candidate.attribution,
            }
        )
        entry = group["entry"]
        if not entry.get("source"):
            entry["source"] = candidate.source_url or candidate.source_id
        if not entry.get("license"):
            entry["license"] = candidate.license
        for value in (
            *candidate.synonyms,
            *candidate.aliases,
            *candidate.alternate_spellings,
        ):
            normalized = normalize_term(value)
            if normalized:
                primary[normalized].add(group_index)

    alias_owners: dict[str, set[int]] = defaultdict(set)
    aliases_by_group: dict[int, set[str]] = defaultdict(set)
    for index, group in enumerate(groups):
        entry = group["entry"]
        values = [*entry.get("synonyms", [])]
        for asset in group["assets"]:
            values.extend((*asset.synonyms, *asset.aliases, *asset.alternate_spellings))
        for value in values:
            normalized = normalize_term(value)
            if normalized:
                alias_owners[normalized].add(index)
                aliases_by_group[index].add(value)
    ambiguous = {
        term: [groups[index]["entry"]["token_id"] for index in sorted(owners)]
        for term, owners in alias_owners.items()
        if len(owners) > 1
    }
    for index, group in enumerate(groups):
        entry = group["entry"]
        primary_terms = {
            normalize_term(entry["concept"]),
            normalize_term(entry["gloss"]),
        }
        entry["synonyms"] = sorted(
            {
                value
                for value in aliases_by_group[index]
                if normalize_term(value) not in primary_terms
                and normalize_term(value) not in ambiguous
            },
            key=str.casefold,
        )
    document = {"version": "1.1", "entries": [group["entry"] for group in groups]}
    rich = {
        "schema_version": "1.0",
        "version": "1.1",
        "entries": [
            {
                **group["entry"],
                "aliases": sorted(aliases_by_group[index], key=str.casefold),
                "sources": _dedupe_dicts(group["sources"]),
                "confidence_score": max(
                    (asset.confidence_score for asset in group["assets"]), default=0.0
                ),
                "assets": [
                    {
                        "asset_id": asset.asset_id,
                        "media_sha256": asset.media_sha256,
                        "animation_available": asset.animation_available,
                        "animation_clip": Path(asset.animation_clip).name
                        if asset.animation_clip
                        else "",
                    }
                    for asset in group["assets"]
                ],
            }
            for index, group in enumerate(groups)
        ],
        "ambiguous_aliases": ambiguous,
    }
    return document, rich, ambiguous


def _asset_index_record(candidate: CandidateAsset) -> dict[str, Any]:
    return {
        "token_id": candidate.token_id,
        "canonical_gloss": candidate.canonical_gloss,
        "synonyms": list(candidate.synonyms),
        "aliases": list(candidate.aliases),
        "alternate_spellings": list(candidate.alternate_spellings),
        "source_id": candidate.source_id,
        "source_url": candidate.source_url,
        "attribution": candidate.attribution,
        "license": candidate.license,
        "license_status": candidate.license_status,
        "review_status": candidate.review_status,
        "confidence_score": candidate.confidence_score,
        "media_sha256": candidate.media_sha256,
        "animation_available": candidate.animation_available,
        "animation_clip": Path(candidate.animation_clip).name
        if candidate.animation_clip
        else "",
        "issues": list(candidate.issues),
    }


def _duplicates(
    candidates: tuple[CandidateAsset, ...], key: Any
) -> dict[str, list[CandidateAsset]]:
    grouped: dict[str, list[CandidateAsset]] = defaultdict(list)
    for candidate in candidates:
        value = key(candidate)
        if value:
            grouped[value].append(candidate)
    return {value: items for value, items in grouped.items() if len(items) > 1}


def _category(value: str) -> str:
    return CATEGORY_MAP.get(normalize_term(value), "General")


def _unique_token(preferred: str, used: set[str]) -> str:
    if preferred.casefold() not in used:
        return preferred
    position = 2
    while f"{preferred}-{position}".casefold() in used:
        position += 1
    return f"{preferred}-{position}"


def _dedupe_dicts(values: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    result: list[dict[str, Any]] = []
    for value in values:
        key = json.dumps(value, sort_keys=True)
        if key not in seen:
            seen.add(key)
            result.append(value)
    return result


def _animation_quality(candidates: tuple[CandidateAsset, ...]) -> dict[str, float]:
    ratios: dict[str, list[float]] = {"pose": [], "face": [], "hand": []}
    for candidate in candidates:
        if not candidate.animation_clip:
            continue
        clip = json.loads(Path(candidate.animation_clip).read_text(encoding="utf-8"))
        quality = clip.get("quality", {})
        sampled = max(1, int(quality.get("sampled_frames", 0)))
        ratios["pose"].append(int(quality.get("pose_frames", 0)) / sampled)
        ratios["face"].append(int(quality.get("face_frames", 0)) / sampled)
        ratios["hand"].append(
            max(
                int(quality.get("left_hand_frames", 0)),
                int(quality.get("right_hand_frames", 0)),
            )
            / sampled
        )
    return {
        name: sum(values) / len(values) if values else 0.0
        for name, values in ratios.items()
    }
