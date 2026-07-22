from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, Request, status

from signverse_api.models.transcription import TranscriptionResponse
from signverse_api.services.transcription import (
    AudioTranscriptionService,
    TranscriptionRateLimitError,
    TranscriptionServiceError,
    TranscriptionTimeoutError,
)

router = APIRouter(tags=["transcription"])

MAX_AUDIO_BYTES = 8 * 1024 * 1024
SUPPORTED_AUDIO_TYPES = {
    "audio/mp4",
    "audio/mpeg",
    "audio/ogg",
    "audio/wav",
    "audio/webm",
}


@router.post(
    "/transcribe",
    response_model=TranscriptionResponse,
    status_code=status.HTTP_200_OK,
    summary="Transcribe a user-authorized tab-audio segment",
)
async def transcribe(
    request: Request,
    language: Annotated[str, Header(alias="X-SignVerse-Language")] = "en",
) -> TranscriptionResponse:
    service: AudioTranscriptionService | None = request.app.state.transcription_service
    if service is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Audio transcription requires an OpenAI API key.",
        )

    content_type = request.headers.get("content-type", "").split(";", 1)[0].lower()
    if content_type not in SUPPORTED_AUDIO_TYPES:
        raise HTTPException(status_code=415, detail="Unsupported audio format.")
    audio = await request.body()
    if not audio:
        raise HTTPException(status_code=422, detail="Audio segment is empty.")
    if len(audio) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Audio segment exceeds the 8 MB limit.")

    try:
        return await service.transcribe(
            audio,
            content_type=content_type,
            language=language,
        )
    except TranscriptionTimeoutError as error:
        raise HTTPException(status_code=504, detail=str(error)) from error
    except TranscriptionRateLimitError as error:
        raise HTTPException(status_code=429, detail=str(error)) from error
    except TranscriptionServiceError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
