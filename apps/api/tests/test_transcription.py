from types import SimpleNamespace
from typing import Any, cast

import pytest
from httpx import ASGITransport, AsyncClient
from openai import AsyncOpenAI

from signverse_api.app import create_app
from signverse_api.config import Settings
from signverse_api.models.transcription import TranscriptionResponse
from signverse_api.services.transcription import AudioTranscriptionService


class FakeTranscriptions:
    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    async def create(self, **kwargs: Any) -> SimpleNamespace:
        self.calls.append(kwargs)
        return SimpleNamespace(text="The video explains accessible communication.")


class FakeClient:
    def __init__(self) -> None:
        self.transcriptions = FakeTranscriptions()
        self.audio = SimpleNamespace(transcriptions=self.transcriptions)
        self.closed = False

    async def close(self) -> None:
        self.closed = True


class FakeTranscriptionService:
    def __init__(self) -> None:
        self.calls: list[tuple[bytes, str, str]] = []

    async def transcribe(
        self,
        audio: bytes,
        *,
        content_type: str,
        language: str,
    ) -> TranscriptionResponse:
        self.calls.append((audio, content_type, language))
        return TranscriptionResponse(text="Spoken caption from the video.", language=language)


@pytest.mark.anyio
async def test_transcription_requires_configured_credentials(client: AsyncClient) -> None:
    response = await client.post(
        "/transcribe",
        content=b"webm-audio",
        headers={"Content-Type": "audio/webm", "X-SignVerse-Language": "en"},
    )

    assert response.status_code == 503


@pytest.mark.anyio
async def test_audio_service_returns_clean_english_transcript() -> None:
    fake_client = FakeClient()
    service = AudioTranscriptionService(
        api_key="test-key",
        model="gpt-4o-mini-transcribe",
        timeout_seconds=20,
        client=cast(AsyncOpenAI, fake_client),
    )

    result = await service.transcribe(
        b"webm-audio",
        content_type="audio/webm",
        language="en",
    )

    assert result.text == "The video explains accessible communication."
    assert result.language == "en"
    assert fake_client.transcriptions.calls[0]["model"] == "gpt-4o-mini-transcribe"
    assert fake_client.transcriptions.calls[0]["file"] == (
        "signverse-segment.webm",
        b"webm-audio",
        "audio/webm",
    )


@pytest.mark.anyio
async def test_transcription_endpoint_accepts_bounded_webm_audio() -> None:
    app = create_app(Settings(environment="test", interpretation_provider="mock"))
    fake_service = FakeTranscriptionService()
    app.state.transcription_service = fake_service
    transport = ASGITransport(app=app)

    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=transport, base_url="http://test") as test_client:
            response = await test_client.post(
                "/transcribe",
                content=b"webm-audio",
                headers={"Content-Type": "audio/webm", "X-SignVerse-Language": "en"},
            )
            unsupported = await test_client.post(
                "/transcribe",
                content=b"audio",
                headers={"Content-Type": "application/octet-stream"},
            )
            empty = await test_client.post(
                "/transcribe",
                content=b"",
                headers={"Content-Type": "audio/webm"},
            )
            oversized = await test_client.post(
                "/transcribe",
                content=b"0" * (8 * 1024 * 1024 + 1),
                headers={"Content-Type": "audio/webm"},
            )

    assert response.status_code == 200
    assert response.json() == {"text": "Spoken caption from the video.", "language": "en"}
    assert fake_service.calls == [(b"webm-audio", "audio/webm", "en")]
    assert unsupported.status_code == 415
    assert empty.status_code == 422
    assert oversized.status_code == 413
