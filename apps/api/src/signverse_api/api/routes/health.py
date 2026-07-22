from fastapi import APIRouter, Request, status

from signverse_api import __version__
from signverse_api.config import Settings
from signverse_api.models.health import HealthResponse

router = APIRouter(tags=["system"])


@router.get(
    "/health",
    response_model=HealthResponse,
    status_code=status.HTTP_200_OK,
    summary="Check service readiness",
)
async def health(request: Request) -> HealthResponse:
    settings: Settings = request.app.state.settings
    return HealthResponse(version=__version__, environment=settings.environment)
