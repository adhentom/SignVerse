import json
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path

from pydantic import ValidationError

from signverse_api.models.playback import SignAssetMetadata
from signverse_api.services.playback.normalization import gloss_candidates

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
ENRICHMENT_FIELDS = {
    "aliases",
    "alternate_spellings",
    "source_id",
    "source_url",
    "attribution",
    "license_status",
    "confidence_score",
    "animation_available",
    "animation_clip",
    "media_sha256",
}


class SignAssetRegistryError(ValueError):
    """Raised when sign asset metadata or registry relationships are invalid."""


@dataclass(frozen=True, slots=True)
class SignAsset:
    metadata: SignAssetMetadata
    path: Path | None


class SignAssetRegistry:
    """Read-only asset manager that indexes validated dataset media by token and asset."""

    def __init__(self, root: Path = DEFAULT_SIGN_ASSET_PATH) -> None:
        self._root = root
        self._assets_by_token, self._assets_by_id = self._load(root)
        self._assets_by_gloss = self._index_glosses(self._assets_by_token.values())

    @staticmethod
    def _load(root: Path) -> tuple[dict[str, SignAsset], dict[str, SignAsset]]:
        if not root.is_dir():
            raise SignAssetRegistryError(f"Sign asset registry does not exist: {root}")

        enrichment = SignAssetRegistry._load_enrichment(root)
        assets: dict[str, SignAsset] = {}
        assets_by_id: dict[str, SignAsset] = {}
        token_ids: set[str] = set()
        asset_ids: set[str] = set()
        for metadata_path in sorted(root.glob("*/metadata.json")):
            try:
                raw_metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
                asset_id = str(raw_metadata.get("asset_id", "")).casefold()
                overlay = enrichment.get(asset_id, {})
                overlay_token = str(overlay.get("token_id", "")).casefold()
                metadata_token = str(raw_metadata.get("token_id", "")).casefold()
                if overlay_token and overlay_token != metadata_token:
                    raise SignAssetRegistryError(
                        f"Asset index token mismatch for {raw_metadata.get('asset_id', '')}."
                    )
                enriched_metadata = {
                    **raw_metadata,
                    **{key: value for key, value in overlay.items() if key in ENRICHMENT_FIELDS},
                }
                metadata = SignAssetMetadata.model_validate(enriched_metadata)
            except (OSError, json.JSONDecodeError, ValidationError) as error:
                raise SignAssetRegistryError(
                    f"Unable to load sign asset metadata: {metadata_path}"
                ) from error

            token_key = metadata.token_id.casefold()
            asset_key = metadata.asset_id.casefold()
            if token_key in token_ids:
                raise SignAssetRegistryError(f"Duplicate sign asset token ID: {metadata.token_id}")
            if asset_key in asset_ids:
                raise SignAssetRegistryError(f"Duplicate sign asset ID: {metadata.asset_id}")

            asset_files = [
                path
                for path in metadata_path.parent.iterdir()
                if path.name not in {"metadata.json", "AnimationClip.json"}
                and path.suffix.casefold() in SUPPORTED_ASSET_SUFFIXES
            ]
            if len(asset_files) > 1:
                raise SignAssetRegistryError(
                    f"Sign asset {metadata.asset_id} must contain at most one supported asset file."
                )
            if asset_files and (
                asset_files[0].suffix.casefold() != ASSET_SUFFIX_BY_TYPE[metadata.animation_type]
            ):
                raise SignAssetRegistryError(
                    f"Sign asset {metadata.asset_id} declares {metadata.animation_type} "
                    f"but uses {asset_files[0].suffix}."
                )
            clip_path: Path | None = None
            if metadata.animation_available:
                clip_path = metadata_path.parent / metadata.animation_clip
                if not metadata.animation_clip or not clip_path.is_file():
                    raise SignAssetRegistryError(
                        f"Sign asset {metadata.asset_id} declares a missing animation clip."
                    )

            token_ids.add(token_key)
            asset_ids.add(asset_key)
            # Dataset media may remain pending linguistic review, but generic
            # placeholders must never enter production playback.
            if metadata.animation_type == "placeholder":
                continue
            playable_path = asset_files[0] if asset_files else clip_path
            assets[token_key] = SignAsset(metadata=metadata, path=playable_path)

            assets_by_id[asset_key] = assets[token_key]

        unknown_enrichment = set(enrichment) - asset_ids
        if unknown_enrichment:
            raise SignAssetRegistryError(
                "Sign asset index contains unknown asset IDs: "
                + ", ".join(sorted(unknown_enrichment))
            )
        return assets, assets_by_id

    @staticmethod
    def _load_enrichment(root: Path) -> dict[str, dict[str, object]]:
        path = root / "index.json"
        if not path.is_file():
            return {}
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise SignAssetRegistryError(f"Unable to load sign asset index: {path}") from error
        if not isinstance(raw, dict) or not all(isinstance(value, dict) for value in raw.values()):
            raise SignAssetRegistryError("Sign asset index must map asset IDs to objects.")
        return {str(key).casefold(): value for key, value in raw.items()}

    def lookup(self, token_id: str) -> SignAsset | None:
        return self._assets_by_token.get(token_id.strip().casefold())

    def lookup_asset(self, asset_id: str) -> SignAsset | None:
        return self._assets_by_id.get(asset_id.strip().casefold())

    @staticmethod
    def _index_glosses(assets: Iterable[SignAsset]) -> dict[str, SignAsset]:
        index: dict[str, SignAsset] = {}
        for asset in assets:
            terms = (
                asset.metadata.canonical_gloss,
                asset.metadata.word,
                *asset.metadata.synonyms,
                *asset.metadata.aliases,
                *asset.metadata.alternate_spellings,
            )
            for term in terms:
                for candidate in gloss_candidates(term):
                    if candidate:
                        existing = index.get(candidate)
                        if existing is None or SignAssetRegistry._rank(
                            asset
                        ) > SignAssetRegistry._rank(existing):
                            index[candidate] = asset
        return index

    @staticmethod
    def _rank(asset: SignAsset) -> tuple[int, int, int, float, str]:
        metadata = asset.metadata
        return (
            int(metadata.review_status == "approved"),
            int(metadata.license_status == "approved"),
            int(metadata.animation_available),
            metadata.confidence_score,
            metadata.asset_id,
        )

    def lookup_gloss(self, gloss: str) -> SignAsset | None:
        for candidate in gloss_candidates(gloss):
            if asset := self._assets_by_gloss.get(candidate):
                return asset
        return None

    def list_assets(self) -> list[SignAsset]:
        return list(self._assets_by_token.values())

    def health(self) -> dict[str, int | str]:
        return {
            "status": "ready",
            "indexed_assets": len(self._assets_by_id),
            "mapped_tokens": len(self._assets_by_token),
        }


ISLAssetManager = SignAssetRegistry
