import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from signverse_api import __version__
from signverse_api.api.router import api_router
from signverse_api.config import Settings, get_settings
from signverse_api.logging import RequestLoggingMiddleware, configure_logging
from signverse_api.providers.base import ClosableInterpretationProvider
from signverse_api.providers.factory import create_interpretation_provider
from signverse_api.services.interpretation import InterpretationService
from signverse_api.services.lexicon import GlossValidator, JSONLexiconProvider
from signverse_api.services.playback import PlaybackPlanner, PlaybackService, SignAssetRegistry

logger = logging.getLogger(__name__)


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved_settings = settings or get_settings()
    configure_logging(resolved_settings.log_level)
    provider = create_interpretation_provider(resolved_settings)
    lexicon = JSONLexiconProvider()
    playback_service = PlaybackService(
        lexicon=lexicon,
        validator=GlossValidator(lexicon),
        planner=PlaybackPlanner(SignAssetRegistry()),
    )
    interpretation_service = InterpretationService(provider, playback_service)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        logger.info(
            "service_started",
            extra={
                "environment": resolved_settings.environment,
                "interpretation_provider": provider.name,
            },
        )
        try:
            yield
        finally:
            if isinstance(provider, ClosableInterpretationProvider):
                await provider.close()
            logger.info("service_stopped")

    app = FastAPI(
        title="SignVerse AI Interpretation API",
        description="Validated ContentPacket ingestion and interpretation orchestration.",
        version=__version__,
        docs_url="/docs" if resolved_settings.docs_enabled else None,
        redoc_url="/redoc" if resolved_settings.docs_enabled else None,
        openapi_url="/openapi.json" if resolved_settings.docs_enabled else None,
        lifespan=lifespan,
    )
    app.state.settings = resolved_settings
    app.state.interpretation_service = interpretation_service
    app.add_middleware(RequestLoggingMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=resolved_settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "X-Request-ID"],
    )
    app.include_router(api_router)
    return app
