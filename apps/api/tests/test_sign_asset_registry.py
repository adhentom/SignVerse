import json
from collections.abc import Mapping
from pathlib import Path

import pytest

from signverse_api.services.playback import SignAssetRegistry, SignAssetRegistryError


def metadata(token_id: str = "greeting-hello", asset_id: str = "asset-hello") -> dict[str, object]:
    return {
        "token_id": token_id,
        "asset_id": asset_id,
        "display_name": "Hello",
        "category": "Greetings",
        "review_status": "draft",
        "animation_type": "placeholder",
        "version": "1.0",
    }


def write_asset(root: Path, directory: str, values: Mapping[str, object]) -> None:
    asset_directory = root / directory
    asset_directory.mkdir(parents=True)
    (asset_directory / "metadata.json").write_text(json.dumps(values), encoding="utf-8")
    (asset_directory / "placeholder.svg").write_text("<svg/>", encoding="utf-8")


def test_default_registry_excludes_public_placeholders_and_third_party_media() -> None:
    registry = SignAssetRegistry()

    assert registry.list_assets() == []
    assert registry.lookup(" NUMBER-ONE ") is None
    assert registry.lookup(" GREETING-HELLO ") is None
    assert registry.lookup_asset("KAGGLE-ANIMATED-HELLO-V1") is None
    assert registry.lookup_gloss("hello") is None
    assert registry.lookup_gloss("computer") is None
    assert registry.lookup("missing") is None
    assert registry.lookup_asset("DATASET-NUMBER-ONE-V1") is None
    assert registry.lookup_gloss(" ONE! ") is None
    assert registry.lookup_gloss("affirmative") is None
    assert registry.lookup_gloss("unknown") is None
    assert registry.health() == {
        "status": "ready",
        "indexed_assets": 0,
        "mapped_tokens": 0,
    }


def test_registry_rejects_missing_or_empty_root(tmp_path: Path) -> None:
    with pytest.raises(SignAssetRegistryError, match="does not exist"):
        SignAssetRegistry(tmp_path / "missing")

    assert SignAssetRegistry(tmp_path).list_assets() == []


def test_registry_rejects_invalid_metadata(tmp_path: Path) -> None:
    directory = tmp_path / "invalid"
    directory.mkdir()
    (directory / "metadata.json").write_text("not-json", encoding="utf-8")

    with pytest.raises(SignAssetRegistryError, match="Unable to load sign asset metadata"):
        SignAssetRegistry(tmp_path)


@pytest.mark.parametrize(
    ("second", "message"),
    [
        (metadata(token_id="greeting-hello", asset_id="asset-two"), "token ID"),
        (metadata(token_id="greeting-welcome", asset_id="asset-hello"), "asset ID"),
    ],
)
def test_registry_rejects_duplicate_identifiers(
    tmp_path: Path,
    second: Mapping[str, object],
    message: str,
) -> None:
    write_asset(tmp_path, "one", metadata())
    write_asset(tmp_path, "two", second)

    with pytest.raises(SignAssetRegistryError, match=message):
        SignAssetRegistry(tmp_path)


def test_registry_rejects_multiple_supported_assets(tmp_path: Path) -> None:
    write_asset(tmp_path, "hello", metadata())
    (tmp_path / "hello" / "second.mp4").write_bytes(b"placeholder")

    with pytest.raises(SignAssetRegistryError, match="at most one"):
        SignAssetRegistry(tmp_path)


def test_registry_ignores_generated_animation_clip_sidecar(tmp_path: Path) -> None:
    values = metadata()
    values["animation_type"] = "mp4"
    directory = tmp_path / "hello"
    directory.mkdir()
    (directory / "metadata.json").write_text(json.dumps(values), encoding="utf-8")
    (directory / "hello.mp4").write_bytes(b"validated-video")
    (directory / "AnimationClip.json").write_text(
        json.dumps({"schema": "signverse.animation-clip"}), encoding="utf-8"
    )

    asset = SignAssetRegistry(tmp_path).lookup("greeting-hello")

    assert asset is not None
    assert asset.path is not None
    assert asset.path.name == "hello.mp4"


def test_registry_indexes_generated_clip_when_source_media_is_not_distributed(
    tmp_path: Path,
) -> None:
    values = metadata()
    values.update(
        {
            "animation_type": "mp4",
            "animation_available": True,
            "animation_clip": "AnimationClip.json",
        }
    )
    directory = tmp_path / "hello"
    directory.mkdir()
    (directory / "metadata.json").write_text(json.dumps(values), encoding="utf-8")
    (directory / "AnimationClip.json").write_text(
        json.dumps({"schema": "signverse.animation-clip"}), encoding="utf-8"
    )

    asset = SignAssetRegistry(tmp_path).lookup("greeting-hello")

    assert asset is not None
    assert asset.path is not None
    assert asset.path.name == "AnimationClip.json"


def test_registry_indexes_unavailable_asset_without_a_playable_path(
    tmp_path: Path,
) -> None:
    directory = tmp_path / "hello"
    directory.mkdir()
    values = metadata()
    values["animation_type"] = "mp4"
    (directory / "metadata.json").write_text(json.dumps(values), encoding="utf-8")

    registry = SignAssetRegistry(tmp_path)

    asset = registry.lookup("greeting-hello")
    assert asset is not None
    assert asset.path is None
    assert asset.metadata.animation_available is False
    assert registry.health()["indexed_assets"] == 1


def test_registry_applies_asset_index_aliases_and_quality_ranking(tmp_path: Path) -> None:
    for directory_name, asset_id, status in (
        ("draft", "asset-draft", "draft"),
        ("approved", "asset-approved", "approved"),
    ):
        directory = tmp_path / directory_name
        directory.mkdir()
        values = metadata(token_id=f"token-{directory_name}", asset_id=asset_id)
        values.update(
            {
                "animation_type": "mp4",
                "review_status": status,
                "canonical_gloss": "HELLO",
                "word": "hello",
            }
        )
        (directory / "metadata.json").write_text(json.dumps(values), encoding="utf-8")
        (directory / f"{directory_name}.mp4").write_bytes(b"validated-video")
        if status == "approved":
            (directory / "AnimationClip.json").write_text("{}", encoding="utf-8")
    (tmp_path / "index.json").write_text(
        json.dumps(
            {
                "asset-approved": {
                    "aliases": ["salutation"],
                    "license_status": "approved",
                    "confidence_score": 0.95,
                    "animation_available": True,
                    "animation_clip": "AnimationClip.json",
                }
            }
        ),
        encoding="utf-8",
    )

    registry = SignAssetRegistry(tmp_path)

    selected = registry.lookup_gloss("hello")
    assert selected is not None
    assert selected.metadata.asset_id == "asset-approved"
    alias = registry.lookup_gloss("SALUTATION")
    assert alias is not None
    assert alias.metadata.animation_available is True
    assert alias.metadata.confidence_score == 0.95


def test_registry_rejects_invalid_asset_index(tmp_path: Path) -> None:
    (tmp_path / "index.json").write_text("[]", encoding="utf-8")

    with pytest.raises(SignAssetRegistryError, match="must map asset IDs"):
        SignAssetRegistry(tmp_path)


def test_registry_rejects_unknown_asset_index_entry(tmp_path: Path) -> None:
    (tmp_path / "index.json").write_text(
        json.dumps({"missing-asset": {"aliases": ["missing"]}}), encoding="utf-8"
    )

    with pytest.raises(SignAssetRegistryError, match="unknown asset IDs"):
        SignAssetRegistry(tmp_path)


def test_registry_rejects_asset_format_mismatch(tmp_path: Path) -> None:
    values = metadata()
    values["animation_type"] = "mp4"
    write_asset(tmp_path, "hello", values)

    with pytest.raises(SignAssetRegistryError, match=r"declares mp4 but uses \.svg"):
        SignAssetRegistry(tmp_path)
