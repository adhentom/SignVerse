from signverse_api.models.content import ContentPacket
from signverse_api.models.interpretation import InterpretationResponse


class InterpretationService:
    async def interpret(self, packet: ContentPacket) -> InterpretationResponse:
        """Return the stable mock contract until interpretation is approved."""
        del packet
        return InterpretationResponse()
