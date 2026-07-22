from __future__ import annotations

import json
from pathlib import Path

import pytest

from signverse_datasets.adapters import inspect_source
from signverse_datasets.config import load_sources
from signverse_datasets.pipeline import DatasetPipeline


def lexicon_entry(token_id: str, concept: str) -> dict[str, object]:
    return {
        "token_id": token_id,
        "concept": concept,
        "gloss": concept.upper(),
        "category": "Greetings",
        "language": "ISL",
        "region": "India",
        "version": "1.0",
        "review_status": "draft",
        "source": "",
        "license": "",
        "synonyms": [],
        "related_tokens": [],
    }


def write_config(repository: Path, sources: list[dict[str, object]]) -> Path:
    path = repository / "config.json"
    path.write_text(
        json.dumps({"schema_version": "1.0", "sources": sources}), encoding="utf-8"
    )
    return path


def write_asset(
    root: Path,
    name: str,
    *,
    word: str,
    content: bytes = b"video",
    animation: bool = False,
) -> Path:
    directory = root / name
    directory.mkdir(parents=True)
    video = directory / f"{name}.mp4"
    video.write_bytes(content)
    (directory / "metadata.json").write_text(
        json.dumps(
            {
                "token_id": name,
                "asset_id": f"asset-{name}",
                "display_name": word,
                "category": "greetings",
                "review_status": "draft",
                "animation_type": "mp4",
                "canonical_gloss": word.upper(),
                "word": word,
                "synonyms": [],
                "language": "ISL",
                "license": "test-license",
                "duration": 1.0,
                "version": "1.0",
            }
        ),
        encoding="utf-8",
    )
    if animation:
        (directory / "AnimationClip.json").write_text("{}", encoding="utf-8")
    return video


def base_source(path: str, **overrides: object) -> dict[str, object]:
    source: dict[str, object] = {
        "id": "test-source",
        "type": "folder",
        "path": path,
        "enabled": True,
        "license_status": "approved",
        "license": "test-license",
        "source_url": "https://example.test/source",
        "attribution": "Test source",
        "review_status": "governed",
        "media_glob": "*/*.mp4",
    }
    source.update(overrides)
    return source


def test_csv_catalog_is_inventory_not_vocabulary(tmp_path: Path) -> None:
    csv_path = tmp_path / "catalog.csv"
    csv_path.write_text(
        "number,label,url\n1,A,https://example.test/a\n", encoding="utf-8"
    )
    config = write_config(
        tmp_path,
        [
            base_source(
                "catalog.csv",
                type="csv",
                record_kind="catalog",
                columns={"identifier": "number", "label": "label", "source_url": "url"},
            )
        ],
    )

    inventory = inspect_source(load_sources(config, tmp_path)[0])

    assert inventory.candidates == ()
    assert inventory.catalog_records[0].label == "A"


@pytest.mark.parametrize("source_type", ["json", "mp4", "folder"])
def test_configured_adapters_produce_candidates(
    tmp_path: Path, source_type: str
) -> None:
    if source_type == "json":
        (tmp_path / "source.json").write_text(
            json.dumps({"entries": [{"word": "hello", "canonical_gloss": "HELLO"}]}),
            encoding="utf-8",
        )
        source = base_source(
            "source.json",
            type="json",
            columns={"word": "word", "canonical_gloss": "canonical_gloss"},
        )
    elif source_type == "mp4":
        (tmp_path / "hello.mp4").write_bytes(b"video")
        source = base_source("hello.mp4", type="mp4")
    else:
        write_asset(tmp_path / "assets", "hello", word="hello")
        source = base_source("assets")
    config = write_config(tmp_path, [source])

    inventory = inspect_source(load_sources(config, tmp_path)[0])

    assert len(inventory.candidates) == 1
    assert inventory.candidates[0].canonical_gloss == "HELLO"


def test_pipeline_merges_assets_without_mutating_source_metadata(
    tmp_path: Path,
) -> None:
    lexicon_root = tmp_path / "apps/api/resources/lexicon"
    lexicon_root.mkdir(parents=True)
    (lexicon_root / "lexicon.json").write_text(
        json.dumps({"version": "1.0", "entries": [lexicon_entry("hello", "hello")]}),
        encoding="utf-8",
    )
    assets = tmp_path / "assets/signs"
    write_asset(assets, "hello", word="hello", animation=True)
    write_asset(assets, "beautiful", word="beautiful")
    original = (assets / "hello/metadata.json").read_bytes()
    config = write_config(tmp_path, [base_source("assets/signs")])

    result = DatasetPipeline(tmp_path, config).run()

    generated = json.loads((lexicon_root / "lexicon.generated.json").read_text())
    index = json.loads((assets / "index.json").read_text())
    assert result.base_vocabulary == 1
    assert result.merged_vocabulary == 2
    assert result.animations == 1
    assert result.mp4_fallbacks == 1
    assert index["asset-hello"]["animation_available"] is True
    assert {entry["concept"] for entry in generated["entries"]} == {
        "hello",
        "beautiful",
    }
    assert (assets / "hello/metadata.json").read_bytes() == original


def test_promotion_is_permission_gated_and_never_overwrites(tmp_path: Path) -> None:
    imports = tmp_path / "imports"
    source_video = write_asset(imports, "hello", word="hello")
    metadata_path = source_video.parent / "metadata.json"
    metadata = json.loads(metadata_path.read_text())
    metadata["review_status"] = "approved"
    metadata_path.write_text(json.dumps(metadata), encoding="utf-8")
    (tmp_path / "apps/chrome-extension/playback").mkdir(parents=True)
    (tmp_path / "apps/chrome-extension/playback/datasetAssets.json").write_text(
        "[]", encoding="utf-8"
    )
    source = base_source("imports", permission_reference="approval-123")
    config = write_config(tmp_path, [source])
    pipeline = DatasetPipeline(tmp_path, config)

    assert pipeline.promote("test-source") == 1
    assert (tmp_path / "assets/signs/hello/asset-hello.mp4").is_file()
    with pytest.raises(FileExistsError, match="Refusing to overwrite"):
        pipeline.promote("test-source")

    blocked_config = write_config(
        tmp_path,
        [base_source("imports", license_status="conditional", permission_reference="")],
    )
    with pytest.raises(PermissionError, match="permission_reference"):
        DatasetPipeline(tmp_path, blocked_config).promote("test-source")
