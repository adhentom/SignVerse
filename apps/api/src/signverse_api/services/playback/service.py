import re

from signverse_api.models.lexicon import GlossValidationResult
from signverse_api.models.linguistics import InterpretationGloss, ISLToken
from signverse_api.models.playback import PlaybackSequence
from signverse_api.services.lexicon import GlossValidator, JSONLexiconProvider
from signverse_api.services.playback.planner import PlaybackPlanner


class PlaybackService:
    """Resolves provider gloss labels through governance before playback planning."""

    def __init__(
        self,
        lexicon: JSONLexiconProvider,
        validator: GlossValidator,
        planner: PlaybackPlanner,
    ) -> None:
        self._lexicon = lexicon
        self._validator = validator
        self._planner = planner

    async def create_sequence(
        self,
        gloss_labels: list[str],
        confidence: float,
    ) -> PlaybackSequence:
        gloss = await self._resolve(gloss_labels, confidence)
        validation = await self._validator.validate(gloss)
        validated_gloss = self._apply_adjustments(validation)
        sequence = self._planner.plan(validated_gloss)
        unsupported = [token.id for token in validation.unsupported_tokens]
        sequence.unsupported_tokens = list(
            dict.fromkeys([*unsupported, *sequence.unsupported_tokens])
        )
        return sequence

    async def _resolve(self, gloss_labels: list[str], confidence: float) -> InterpretationGloss:
        known_tokens = await self._lexicon.listTokens()
        tokens_by_gloss = {token.gloss.casefold(): token for token in known_tokens}
        version = await self._lexicon.version()
        tokens: list[ISLToken] = []

        for position, label in enumerate(gloss_labels):
            normalized = label.strip().casefold()
            known = tokens_by_gloss.get(normalized)
            if known is not None:
                tokens.append(known.model_copy(update={"confidence": confidence}))
                continue
            safe_label = re.sub(r"[^a-z0-9]+", "-", normalized).strip("-") or "blank"
            tokens.append(
                ISLToken(
                    id=f"unknown:{position}:{safe_label}",
                    concept=label.strip() or "unknown",
                    gloss=label.strip() or "UNKNOWN",
                    confidence=confidence,
                    category="unknown",
                    language="ISL",
                    region="India",
                    version=version,
                )
            )
        return InterpretationGloss(tokens=tokens)

    @staticmethod
    def _apply_adjustments(validation: GlossValidationResult) -> InterpretationGloss:
        confidence_by_id = {
            adjustment.token_id: adjustment.adjusted_confidence
            for adjustment in validation.confidence_adjustments
        }
        return InterpretationGloss(
            tokens=[
                token.model_copy(update={"confidence": confidence_by_id[token.id]})
                for token in validation.supported_tokens
            ]
        )
