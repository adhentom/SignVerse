import logging

from openai import APIError, APITimeoutError, AsyncOpenAI, RateLimitError

from signverse_api.models.transcription import TranscriptionResponse

logger = logging.getLogger(__name__)


class TranscriptionServiceError(RuntimeError):
    """Base error for bounded audio-transcription failures."""


class TranscriptionTimeoutError(TranscriptionServiceError):
    pass


class TranscriptionRateLimitError(TranscriptionServiceError):
    pass


class AudioTranscriptionService:
    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        timeout_seconds: float,
        client: AsyncOpenAI | None = None,
    ) -> None:
        self._model = model
        self._timeout_seconds = timeout_seconds
        self._client = client or AsyncOpenAI(api_key=api_key, timeout=timeout_seconds)

    async def transcribe(
        self,
        audio: bytes,
        *,
        content_type: str,
        language: str,
    ) -> TranscriptionResponse:
        try:
            result = await self._client.audio.transcriptions.create(
                file=("signverse-segment.webm", audio, content_type),
                model=self._model,
                language=language,
                prompt=(
                    "Transcribe the spoken English accurately. "
                    "Preserve complete words and punctuation."
                ),
                response_format="json",
                timeout=self._timeout_seconds,
            )
        except APITimeoutError as error:
            raise TranscriptionTimeoutError("Speech transcription timed out.") from error
        except RateLimitError as error:
            raise TranscriptionRateLimitError(
                "Speech transcription is temporarily rate limited."
            ) from error
        except APIError as error:
            raise TranscriptionServiceError("Speech transcription provider failed.") from error

        text = result.text.strip()
        if not text:
            raise TranscriptionServiceError("No speech was detected in the audio segment.")
        logger.info("audio_transcription_completed", extra={"characters": len(text)})
        return TranscriptionResponse(text=text, language=language)

    async def close(self) -> None:
        await self._client.close()
