from typing import cast

from signverse_api.config import Settings
from signverse_api.providers.base import InterpretationProvider
from signverse_api.providers.mock import MockInterpretationProvider
from signverse_api.providers.openai import (
    OpenAIClient,
    OpenAIInterpretationProvider,
    create_openai_client,
)


def create_interpretation_provider(
    settings: Settings,
    openai_client: OpenAIClient | None = None,
) -> InterpretationProvider:
    if settings.interpretation_provider == "mock":
        return MockInterpretationProvider()

    if settings.openai_api_key is None:
        raise ValueError("OPENAI_API_KEY is required when the OpenAI provider is selected.")

    client = openai_client or cast(
        OpenAIClient,
        create_openai_client(
            api_key=settings.openai_api_key.get_secret_value(),
            timeout_seconds=settings.openai_timeout_seconds,
        ),
    )
    return OpenAIInterpretationProvider(
        client=client,
        model=settings.openai_model,
        max_output_tokens=settings.openai_max_output_tokens,
        semantic_model=settings.openai_semantic_model,
        realization_model=settings.openai_realization_model,
        minimum_semantic_confidence=settings.minimum_semantic_confidence,
        minimum_malayalam_confidence=settings.minimum_malayalam_confidence,
        minimum_gloss_confidence=settings.minimum_gloss_confidence,
        semantic_cache_size=settings.openai_semantic_cache_size,
    )
