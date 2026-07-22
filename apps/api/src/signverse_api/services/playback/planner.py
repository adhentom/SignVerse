from signverse_api.models.linguistics import InterpretationGloss
from signverse_api.models.playback import PlaybackItem, PlaybackMiss, PlaybackSequence
from signverse_api.services.playback.registry import SignAsset, SignAssetRegistry


class PlaybackPlanner:
    """Creates an ordered schedule without knowing how assets are rendered."""

    def __init__(
        self,
        registry: SignAssetRegistry,
        default_duration: float = 1.2,
        minimum_asset_confidence: float = 0.0,
    ) -> None:
        if default_duration <= 0:
            raise ValueError("Default playback duration must be positive.")
        if not 0.0 <= minimum_asset_confidence <= 1.0:
            raise ValueError("Minimum asset confidence must be between 0 and 1.")
        self._registry = registry
        self._default_duration = default_duration
        self._minimum_asset_confidence = minimum_asset_confidence

    def plan(self, gloss: InterpretationGloss) -> PlaybackSequence:
        items: list[PlaybackItem] = []
        unsupported: list[str] = []
        missing: list[PlaybackMiss] = []

        for token in gloss.tokens:
            asset, asset_confidence = self._resolve_asset(token.id, token.gloss)
            if asset is None:
                unsupported.append(token.id)
                missing.append(
                    PlaybackMiss(
                        token=token.gloss,
                        normalized_token=token.gloss.casefold(),
                        reason="lexicon-token-without-asset",
                        detail=(
                            f"Lexicon token '{token.id}' and gloss '{token.gloss}' "
                            "have no indexed dataset asset."
                        ),
                    )
                )
                continue
            if asset_confidence < self._minimum_asset_confidence:
                unsupported.append(token.id)
                missing.append(
                    PlaybackMiss(
                        token=token.gloss,
                        normalized_token=token.gloss.casefold(),
                        reason="asset-unavailable",
                        detail=(
                            f"Asset '{asset.metadata.asset_id}' matched at "
                            f"{asset_confidence:.2f}, below the configured "
                            f"{self._minimum_asset_confidence:.2f} threshold."
                        ),
                    )
                )
                continue
            items.append(
                PlaybackItem(
                    token_id=token.id,
                    asset_id=asset.metadata.asset_id,
                    duration=asset.metadata.duration,
                    confidence=min(token.confidence, asset_confidence),
                    animation_ready=asset.metadata.animation_available,
                )
            )

        return PlaybackSequence(items=items, unsupported_tokens=unsupported, missing=missing)

    def _resolve_asset(self, token_id: str, gloss: str) -> tuple[SignAsset | None, float]:
        if (asset := self._registry.lookup(token_id)) and asset.path is not None:
            return asset, 1.0
        if (asset := self._registry.lookup_gloss(gloss)) and asset.path is not None:
            # Gloss/alias matching is less certain than a governed token-ID match.
            # Dataset confidence refines that estimate when provenance supplied it.
            return asset, max(0.5, asset.metadata.confidence_score)
        return None, 0.0
