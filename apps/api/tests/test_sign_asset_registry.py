import json
from pathlib import Path

import pytest

from signverse_api.services.playback import SignAssetRegistry, SignAssetRegistryError


def metadata(token_id: str = "greeting-hello", asset_id: str = "asset-hello") -> dict[str, str]:
    return {
        "token_id": token_id,
        "asset_id": asset_id,
        "display_name": "Hello",
        "category": "Greetings",
        "review_status": "draft",
        "animation_type": "placeholder",
        "version": "1.0",
    }


def write_asset(root: Path, directory: str, values: dict[str, str]) -> None:
    asset_directory = root / directory
    asset_directory.mkdir(parents=True)
    (asset_directory / "metadata.json").write_text(json.dumps(values), encoding="utf-8")
    (asset_directory / "placeholder.svg").write_text("<svg/>", encoding="utf-8")


def test_default_registry_loads_placeholder_assets() -> None:
    registry = SignAssetRegistry()

    assert len(registry.list_assets()) == 10
    hello = registry.lookup(" GREETING-HELLO ")
    assert hello is not None
    assert hello.metadata.animation_type == "placeholder"
    assert hello.path.name == "placeholder.svg"
    assert registry.lookup("missing") is None


def test_registry_rejects_missing_or_empty_root(tmp_path: Path) -> None:
    with pytest.raises(SignAssetRegistryError, match="does not exist"):
        SignAssetRegistry(tmp_path / "missing")

    with pytest.raises(SignAssetRegistryError, match="contains no assets"):
        SignAssetRegistry(tmp_path)


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
    second: dict[str, str],
    message: str,
) -> None:
    write_asset(tmp_path, "one", metadata())
    write_asset(tmp_path, "two", second)

    with pytest.raises(SignAssetRegistryError, match=message):
        SignAssetRegistry(tmp_path)


def test_registry_requires_exactly_one_supported_asset(tmp_path: Path) -> None:
    write_asset(tmp_path, "hello", metadata())
    (tmp_path / "hello" / "second.mp4").write_bytes(b"placeholder")

    with pytest.raises(SignAssetRegistryError, match="exactly one"):
        SignAssetRegistry(tmp_path)


def test_registry_rejects_asset_format_mismatch(tmp_path: Path) -> None:
    values = metadata()
    values["animation_type"] = "mp4"
    write_asset(tmp_path, "hello", values)

    with pytest.raises(SignAssetRegistryError, match=r"declares mp4 but uses \.svg"):
        SignAssetRegistry(tmp_path)
