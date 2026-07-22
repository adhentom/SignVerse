from typing import Literal

from signverse_api.models.lexicon import (
    CategoryCoverage,
    ConfidenceAdjustment,
    GlossValidationResult,
    GlossValidationStatistics,
)
from signverse_api.models.linguistics import InterpretationGloss, ISLToken
from signverse_api.services.lexicon.json_provider import JSONLexiconProvider


class GlossValidator:
    """Deterministically validates a gloss against the local governed lexicon."""

    def __init__(self, provider: JSONLexiconProvider) -> None:
        self._provider = provider

    async def validate(self, gloss: InterpretationGloss) -> GlossValidationResult:
        supported: list[ISLToken] = []
        unsupported: list[ISLToken] = []
        adjustments: list[ConfidenceAdjustment] = []
        coverage: dict[str, CategoryCoverage] = {}

        for token in gloss.tokens:
            entry = self._provider.entry_for(token)
            is_supported = entry is not None and self._provider.matches(token)
            category = entry.category if is_supported and entry is not None else token.category
            category_stats = coverage.setdefault(
                category,
                CategoryCoverage(total=0, supported=0, unsupported=0),
            )
            category_stats.total += 1

            if not is_supported or entry is None:
                unsupported.append(token)
                category_stats.unsupported += 1
                adjusted_confidence = 0.0
                reason: Literal["approved", "pending-review", "unsupported"] = "unsupported"
            else:
                supported.append(token)
                category_stats.supported += 1
                is_approved = entry.review_status == "approved"
                adjusted_confidence = token.confidence if is_approved else 0.0
                reason = "approved" if is_approved else "pending-review"

            adjustments.append(
                ConfidenceAdjustment(
                    token_id=token.id,
                    original_confidence=token.confidence,
                    adjusted_confidence=adjusted_confidence,
                    reason=reason,
                )
            )

        return GlossValidationResult(
            supported_tokens=supported,
            unsupported_tokens=unsupported,
            confidence_adjustments=adjustments,
            statistics=GlossValidationStatistics(
                total_tokens=len(gloss.tokens),
                supported_tokens=len(supported),
                unsupported_tokens=len(unsupported),
                category_coverage=coverage,
            ),
        )
