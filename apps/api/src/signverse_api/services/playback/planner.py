from signverse_api.models.linguistics import InterpretationGloss
from signverse_api.models.playback import PlaybackItem, PlaybackSequence
from signverse_api.services.playback.registry import SignAssetRegistry


class PlaybackPlanner:
    """Creates an ordered schedule without knowing how assets are rendered."""

    def __init__(self, registry: SignAssetRegistry, default_duration: float = 1.2) -> None:
        if default_duration <= 0:
            raise ValueError("Default playback duration must be positive.")
        self._registry = registry
        self._default_duration = default_duration

    def plan(self, gloss: InterpretationGloss) -> PlaybackSequence:
        items: list[PlaybackItem] = []
        unsupported: list[str] = []

        for token in gloss.tokens:
            asset = self._registry.lookup(token.id)
            if asset is None:
                unsupported.append(token.id)
                continue
            items.append(
                PlaybackItem(
                    token_id=token.id,
                    asset_id=asset.metadata.asset_id,
                    duration=self._default_duration,
                    confidence=token.confidence,
                )
            )

        return PlaybackSequence(items=items, unsupported_tokens=unsupported)
