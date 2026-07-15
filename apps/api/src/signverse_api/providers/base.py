from typing import Protocol, runtime_checkable

from signverse_api.models.content import ContentPacket
from signverse_api.models.interpretation import InterpretationResponse


class InterpretationProvider(Protocol):
    name: str

    async def interpret(self, packet: ContentPacket) -> InterpretationResponse: ...


@runtime_checkable
class ClosableInterpretationProvider(InterpretationProvider, Protocol):
    async def close(self) -> None: ...
