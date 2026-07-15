from signverse_api.models.content import ContentPacket
from signverse_api.models.interpretation import InterpretationResponse


class MockInterpretationProvider:
    name = "mock"

    async def interpret(self, packet: ContentPacket) -> InterpretationResponse:
        del packet
        return InterpretationResponse()
