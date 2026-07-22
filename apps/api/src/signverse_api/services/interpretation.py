import logging

from signverse_api.models.content import ContentPacket
from signverse_api.models.interpretation import InterpretationResponse
from signverse_api.models.isl_plan import InterpretationDiagnostics, InterpretationQuality
from signverse_api.providers.base import InterpretationProvider
from signverse_api.providers.errors import InterpretationProviderError
from signverse_api.services.playback import PlaybackService

logger = logging.getLogger(__name__)


class InterpretationService:
    def __init__(
        self,
        provider: InterpretationProvider,
        playback_service: PlaybackService | None = None,
    ) -> None:
        self._provider = provider
        self._playback_service = playback_service

    async def interpret(self, packet: ContentPacket) -> InterpretationResponse:
        logger.info(
            "interpretation_pipeline_started",
            extra={
                "platform": packet.platform,
                "text_length": len(packet.text),
                "reading_context": packet.metadata.get("readingContext"),
            },
        )
        try:
            response = await self._provider.interpret(packet)
        except InterpretationProviderError as error:
            logger.warning(
                "interpretation_provider_failed",
                extra={"provider": self._provider.name, "error_code": error.code},
            )
            return InterpretationResponse()

        if self._playback_service is None:
            return response
        logger.info(
            "interpretation_gloss_generated",
            extra={
                "gloss_count": len(response.isl_gloss),
                "confidence": response.confidence,
            },
        )
        playback = await self._playback_service.create_sequence(
            response.isl_gloss,
            response.confidence,
            response.isl_segments,
        )
        logger.info(
            "interpretation_playback_planned",
            extra={
                "playback_items": len(playback.items),
                "unsupported_tokens": len(playback.unsupported_tokens),
            },
        )
        total_glosses = len(response.isl_gloss)
        asset_matching = len(playback.items) / total_glosses if total_glosses else 0.0
        animation_readiness = (
            sum(item.animation_ready is True for item in playback.items) / len(playback.items)
            if playback.items
            else 0.0
        )
        quality = response.quality
        if quality is not None or total_glosses:
            quality = quality or InterpretationQuality(
                semantic_accuracy=response.confidence,
                malayalam_translation=response.confidence,
                gloss_correctness=response.confidence,
            )
            quality = quality.model_copy(
                update={
                    "asset_matching": asset_matching,
                    "animation_readiness": animation_readiness,
                    "avatar_confidence": min(
                        quality.gloss_correctness,
                        asset_matching,
                        animation_readiness,
                    ),
                }
            )
        diagnostics = response.diagnostics
        if diagnostics is not None:
            elapsed = 0.0
            timeline: list[dict[str, object]] = []
            for item in playback.items:
                timeline.append(
                    {
                        "token_id": item.token_id,
                        "asset_id": item.asset_id,
                        "start": elapsed,
                        "end": elapsed + item.duration,
                    }
                )
                elapsed += item.duration
            diagnostics = InterpretationDiagnostics(
                source_text=diagnostics.source_text,
                semantic_representation=diagnostics.semantic_representation,
                phrase_segments=diagnostics.phrase_segments,
                matched_assets=[item.asset_id for item in playback.items],
                missing_glosses=[miss.token for miss in playback.missing],
                playback_timeline=timeline,
            )
        return response.model_copy(
            update={"playback": playback, "quality": quality, "diagnostics": diagnostics}
        )
