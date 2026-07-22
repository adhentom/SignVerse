import logging
import re
from collections import defaultdict, deque

from signverse_api.models.isl_plan import ISLGlossUnit, ISLPhraseSegment
from signverse_api.models.lexicon import GlossValidationResult
from signverse_api.models.linguistics import InterpretationGloss, ISLToken
from signverse_api.models.playback import PlaybackMiss, PlaybackSequence
from signverse_api.services.lexicon import GlossValidator, JSONLexiconProvider
from signverse_api.services.playback.normalization import (
    decompose_gloss,
    gloss_candidates,
    normalize_gloss,
)
from signverse_api.services.playback.planner import PlaybackPlanner

logger = logging.getLogger(__name__)


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
        segments: list[ISLPhraseSegment] | None = None,
    ) -> PlaybackSequence:
        contexts = [
            (segment.segment_id, unit) for segment in (segments or []) for unit in segment.glosses
        ]
        gloss, source_labels, token_contexts = await self._resolve(
            gloss_labels,
            confidence,
            contexts if len(contexts) == len(gloss_labels) else [],
        )
        validation = await self._validator.validate(gloss)
        validated_gloss = self._apply_adjustments(validation)
        sequence = self._planner.plan(validated_gloss)
        context_queues = {token_id: deque(values) for token_id, values in token_contexts.items()}
        previous_phrase = ""
        enriched_items = []
        for item in sequence.items:
            context = context_queues.get(item.token_id)
            phrase_id, unit = context.popleft() if context else ("", None)
            transition_ms = 180 if previous_phrase and phrase_id != previous_phrase else 90
            enriched_items.append(
                item.model_copy(
                    update={
                        "phrase_id": phrase_id or None,
                        "source_gloss": unit.gloss if unit else None,
                        "transition_ms": transition_ms,
                        "non_manual_markers": unit.non_manual_markers if unit else None,
                    }
                )
            )
            previous_phrase = phrase_id or previous_phrase
        sequence.items = enriched_items
        unsupported = [token.id for token in validation.unsupported_tokens]
        sequence.unsupported_tokens = list(
            dict.fromkeys([*unsupported, *sequence.unsupported_tokens])
        )
        unknown_missing = [
            PlaybackMiss(
                token=original,
                normalized_token=normalized,
                reason="unknown-gloss",
                detail="No governed lexicon entry matched this normalized gloss.",
            )
            for token_id, (original, normalized) in source_labels.items()
            if token_id in unsupported
        ]
        sequence.missing = [*unknown_missing, *sequence.missing]
        for miss in sequence.missing:
            logger.warning(
                "ISL playback miss token=%r normalized=%r reason=%s detail=%s",
                miss.token,
                miss.normalized_token,
                miss.reason,
                miss.detail,
            )
        return sequence

    async def _resolve(
        self,
        gloss_labels: list[str],
        confidence: float,
        contexts: list[tuple[str, ISLGlossUnit]],
    ) -> tuple[
        InterpretationGloss,
        dict[str, tuple[str, str]],
        dict[str, list[tuple[str, ISLGlossUnit]]],
    ]:
        known_tokens = await self._lexicon.listTokens()
        tokens_by_gloss: dict[str, tuple[ISLToken, str]] = {}
        for token in known_tokens:
            entry = self._lexicon.entry_for(token)
            terms = (
                (token.gloss, "exact"),
                (token.concept, "concept"),
                *((synonym, "synonym") for synonym in (entry.synonyms if entry else [])),
            )
            for term, match_type in terms:
                normalized_term = normalize_gloss(term)
                existing = tokens_by_gloss.get(normalized_term)
                if existing is not None and existing[0].id != token.id:
                    raise ValueError(f"Ambiguous normalized lexicon term: {term}")
                tokens_by_gloss[normalized_term] = (token, match_type)
        version = await self._lexicon.version()
        tokens: list[ISLToken] = []
        source_labels: dict[str, tuple[str, str]] = {}
        token_contexts: dict[str, list[tuple[str, ISLGlossUnit]]] = defaultdict(list)

        for position, label in enumerate(gloss_labels):
            normalized = normalize_gloss(label)
            known = next(
                (
                    tokens_by_gloss[candidate]
                    for candidate in gloss_candidates(label)
                    if candidate in tokens_by_gloss
                ),
                None,
            )
            if known is not None:
                token, match_type = known
                logger.info(
                    "ISL gloss lookup token=%r normalized=%r result=%s token_id=%s",
                    label,
                    normalized,
                    match_type,
                    token.id,
                )
                tokens.append(token.model_copy(update={"confidence": confidence}))
                if contexts:
                    token_contexts[token.id].append(contexts[position])
                continue

            parts = decompose_gloss(label)
            decomposed = [tokens_by_gloss.get(part) for part in parts]
            if len(parts) > 1 and ("_" in label or "-" in label):
                missing_parts = [
                    part for part, match in zip(parts, decomposed, strict=True) if match is None
                ]
                if missing_parts:
                    logger.warning(
                        "ISL gloss lookup token=%r normalized=%r "
                        "result=PARTIAL_DECOMPOSITION_REJECTED missing_parts=%s",
                        label,
                        normalized,
                        missing_parts,
                    )
                    unknown = self._unknown_token(position, 0, label, confidence, version)
                    tokens.append(unknown)
                    source_labels[unknown.id] = (label, normalized)
                    continue
                logger.info(
                    "ISL gloss lookup token=%r normalized=%r result=decomposition parts=%s",
                    label,
                    normalized,
                    parts,
                )
                for match in decomposed:
                    assert match is not None
                    tokens.append(match[0].model_copy(update={"confidence": confidence}))
                    if contexts:
                        token_contexts[match[0].id].append(contexts[position])
                continue

            unknown = self._unknown_token(position, 0, label, confidence, version)
            logger.info(
                "ISL gloss lookup token=%r normalized=%r result=NO_MATCH",
                label,
                normalized,
            )
            tokens.append(unknown)
            source_labels[unknown.id] = (label, normalized)
        return InterpretationGloss(tokens=tokens), source_labels, dict(token_contexts)

    @staticmethod
    def _unknown_token(
        position: int,
        part: int,
        label: str,
        confidence: float,
        version: str,
    ) -> ISLToken:
        normalized = normalize_gloss(label)
        safe_label = re.sub(r"[^a-z0-9]+", "-", normalized).strip("-") or "blank"
        token_id = (
            f"unknown:{position}:{safe_label}"
            if part == 0
            else f"unknown:{position}:{part}:{safe_label}"
        )
        return ISLToken(
            id=token_id,
            concept=label.strip() or "unknown",
            gloss=label.strip() or "UNKNOWN",
            confidence=confidence,
            category="unknown",
            language="ISL",
            region="India",
            version=version,
        )

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
