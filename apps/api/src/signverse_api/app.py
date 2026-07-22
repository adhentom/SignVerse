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
from signverse_api.services.transcription import AudioTranscriptionService

logger = logging.getLogger(__name__)


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved_settings = settings or get_settings()
    configure_logging(resolved_settings.log_level)
    provider = create_interpretation_provider(resolved_settings)
    lexicon = JSONLexiconProvider()
    playback_service = PlaybackService(
        lexicon=lexicon,
        validator=GlossValidator(lexicon),
        planner=PlaybackPlanner(
            SignAssetRegistry(),
            minimum_asset_confidence=resolved_settings.minimum_asset_match_confidence,
        ),
    )
    interpretation_service = InterpretationService(provider, playback_service)
    transcription_service = (
        AudioTranscriptionService(
            api_key=resolved_settings.openai_api_key.get_secret_value(),
            model=resolved_settings.openai_transcription_model,
            timeout_seconds=resolved_settings.openai_transcription_timeout_seconds,
        )
        if resolved_settings.openai_api_key is not None
        else None
    )

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
            if transcription_service is not None:
                await transcription_service.close()
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
    app.state.transcription_service = transcription_service
    app.add_middleware(RequestLoggingMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=resolved_settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=[
            "Content-Type",
            "Authorization",
            "X-Request-ID",
            "X-SignVerse-Language",
        ],
    )
    app.include_router(api_router)
    return app
