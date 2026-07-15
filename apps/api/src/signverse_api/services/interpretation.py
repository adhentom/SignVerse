import logging

from signverse_api.models.content import ContentPacket
from signverse_api.models.interpretation import InterpretationResponse
from signverse_api.providers.base import InterpretationProvider
from signverse_api.providers.errors import InterpretationProviderError

logger = logging.getLogger(__name__)


class InterpretationService:
    def __init__(self, provider: InterpretationProvider) -> None:
        self._provider = provider

    async def interpret(self, packet: ContentPacket) -> InterpretationResponse:
        try:
            return await self._provider.interpret(packet)
        except InterpretationProviderError as error:
            logger.warning(
                "interpretation_provider_failed",
                extra={"provider": self._provider.name, "error_code": error.code},
            )
            return InterpretationResponse()
