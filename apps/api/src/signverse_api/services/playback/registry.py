import json
from dataclasses import dataclass
from pathlib import Path

from pydantic import ValidationError

from signverse_api.models.playback import SignAssetMetadata

LOCAL_SIGN_ASSET_PATH = Path(__file__).resolve().parents[6] / "assets" / "signs"
PACKAGED_SIGN_ASSET_PATH = Path(__file__).resolve().parents[2] / "assets" / "signs"
DEFAULT_SIGN_ASSET_PATH = (
    LOCAL_SIGN_ASSET_PATH if LOCAL_SIGN_ASSET_PATH.is_dir() else PACKAGED_SIGN_ASSET_PATH
)
ASSET_SUFFIX_BY_TYPE = {
    "placeholder": ".svg",
    "gif": ".gif",
    "mp4": ".mp4",
    "lottie": ".json",
    "glb": ".glb",
    "vrm": ".vrm",
}
SUPPORTED_ASSET_SUFFIXES = set(ASSET_SUFFIX_BY_TYPE.values())


class SignAssetRegistryError(ValueError):
    """Raised when sign asset metadata or registry relationships are invalid."""


@dataclass(frozen=True, slots=True)
class SignAsset:
    metadata: SignAssetMetadata
    path: Path


class SignAssetRegistry:
    """Read-only registry that keeps asset formats outside playback planning."""

    def __init__(self, root: Path = DEFAULT_SIGN_ASSET_PATH) -> None:
        self._root = root
        self._assets_by_token = self._load(root)

    @staticmethod
    def _load(root: Path) -> dict[str, SignAsset]:
        if not root.is_dir():
            raise SignAssetRegistryError(f"Sign asset registry does not exist: {root}")

        assets: dict[str, SignAsset] = {}
        asset_ids: set[str] = set()
        for metadata_path in sorted(root.glob("*/metadata.json")):
            try:
                raw_metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
                metadata = SignAssetMetadata.model_validate(raw_metadata)
            except (OSError, json.JSONDecodeError, ValidationError) as error:
                raise SignAssetRegistryError(
                    f"Unable to load sign asset metadata: {metadata_path}"
                ) from error

            token_key = metadata.token_id.casefold()
            asset_key = metadata.asset_id.casefold()
            if token_key in assets:
                raise SignAssetRegistryError(f"Duplicate sign asset token ID: {metadata.token_id}")
            if asset_key in asset_ids:
                raise SignAssetRegistryError(f"Duplicate sign asset ID: {metadata.asset_id}")

            asset_files = [
                path
                for path in metadata_path.parent.iterdir()
                if path.name != "metadata.json"
                and path.suffix.casefold() in SUPPORTED_ASSET_SUFFIXES
            ]
            if len(asset_files) != 1:
                raise SignAssetRegistryError(
                    f"Sign asset {metadata.asset_id} must contain exactly one supported asset file."
                )
            expected_suffix = ASSET_SUFFIX_BY_TYPE[metadata.animation_type]
            if asset_files[0].suffix.casefold() != expected_suffix:
                raise SignAssetRegistryError(
                    f"Sign asset {metadata.asset_id} declares {metadata.animation_type} "
                    f"but uses {asset_files[0].suffix}."
                )

            assets[token_key] = SignAsset(metadata=metadata, path=asset_files[0])
            asset_ids.add(asset_key)

        if not assets:
            raise SignAssetRegistryError("Sign asset registry contains no assets.")
        return assets

    def lookup(self, token_id: str) -> SignAsset | None:
        return self._assets_by_token.get(token_id.strip().casefold())

    def list_assets(self) -> list[SignAsset]:
        return list(self._assets_by_token.values())
