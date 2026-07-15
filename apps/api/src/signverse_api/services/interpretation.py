import logging

from signverse_api.models.content import ContentPacket
from signverse_api.models.interpretation import InterpretationResponse
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
        playback = await self._playback_service.create_sequence(
            response.isl_gloss,
            response.confidence,
        )
        return response.model_copy(update={"playback": playback})
