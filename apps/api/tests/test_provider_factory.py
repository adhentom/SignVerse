import pytest
from pydantic import SecretStr

from signverse_api.config import Settings
from signverse_api.providers.factory import create_interpretation_provider
from signverse_api.providers.mock import MockInterpretationProvider
from signverse_api.providers.openai import OpenAIInterpretationProvider
from tests.test_openai_provider import FakeOpenAIClient, FakeResponsesResource


def test_mock_provider_is_the_development_default() -> None:
    provider = create_interpretation_provider(Settings(environment="test"))

    assert isinstance(provider, MockInterpretationProvider)


def test_openai_provider_requires_api_key() -> None:
    settings = Settings(
        environment="test",
        interpretation_provider="openai",
        openai_api_key=None,
    )

    with pytest.raises(ValueError, match="OPENAI_API_KEY is required"):
        create_interpretation_provider(settings)


def test_openai_provider_can_be_selected_with_injected_client() -> None:
    settings = Settings(
        environment="test",
        interpretation_provider="openai",
        openai_api_key=SecretStr("test-key-not-a-real-secret"),
        openai_model="gpt-test",
    )
    client = FakeOpenAIClient(FakeResponsesResource())

    provider = create_interpretation_provider(settings, openai_client=client)

    assert isinstance(provider, OpenAIInterpretationProvider)
