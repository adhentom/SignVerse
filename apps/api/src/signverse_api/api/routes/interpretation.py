from typing import Annotated

from fastapi import APIRouter, Depends, status

from signverse_api.dependencies import get_interpretation_service
from signverse_api.models.content import ContentPacket
from signverse_api.models.interpretation import InterpretationResponse
from signverse_api.services.interpretation import InterpretationService

router = APIRouter(tags=["interpretation"])


@router.post(
    "/interpret",
    response_model=InterpretationResponse,
    response_model_exclude_none=True,
    status_code=status.HTTP_200_OK,
    summary="Interpret a content packet",
)
async def interpret(
    packet: ContentPacket,
    service: Annotated[InterpretationService, Depends(get_interpretation_service)],
) -> InterpretationResponse:
    return await service.interpret(packet)
