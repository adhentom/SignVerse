import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from signverse_api.models.streaming import (
    StreamError,
    StreamInterpretation,
    StreamRequest,
    StreamReset,
)
from signverse_api.services.interpretation import InterpretationService

router = APIRouter(tags=["streaming"])
logger = logging.getLogger(__name__)


@router.websocket("/stream")
async def stream_interpretation(websocket: WebSocket) -> None:
    origin = websocket.headers.get("origin")
    allowed_origins: list[str] = websocket.app.state.settings.cors_origins
    development_extension = (
        websocket.app.state.settings.environment == "development"
        and origin is not None
        and origin.startswith("chrome-extension://")
    )
    if origin and origin not in allowed_origins and not development_extension:
        await websocket.close(code=1008, reason="Origin is not allowed")
        return
    await websocket.accept()
    service: InterpretationService = websocket.app.state.interpretation_service
    try:
        while True:
            try:
                raw = await websocket.receive_json()
            except json.JSONDecodeError:
                await websocket.send_json(
                    StreamError(
                        code="invalid-message",
                        message="The streaming message was not valid JSON.",
                    ).model_dump(mode="json")
                )
                continue
            try:
                message = StreamRequest.model_validate(raw)
            except ValidationError:
                await websocket.send_json(
                    StreamError(
                        code="invalid-message",
                        message="The streaming message did not match the trusted contract.",
                    ).model_dump(mode="json")
                )
                continue

            if message.type == "reset":
                await websocket.send_json(
                    StreamReset(
                        sequence=message.sequence,
                        session_id=message.session_id,
                    ).model_dump(mode="json")
                )
                continue

            if message.packet is None:  # guarded by StreamRequest validation
                continue
            try:
                response = await service.interpret(message.packet)
            except Exception:
                logger.exception("interpretation_stream_packet_failed")
                await websocket.send_json(
                    StreamError(
                        sequence=message.sequence,
                        session_id=message.session_id,
                        code="interpretation-failed",
                        message="The streamed packet could not be interpreted.",
                    ).model_dump(mode="json")
                )
                continue
            await websocket.send_json(
                StreamInterpretation(
                    sequence=message.sequence,
                    session_id=message.session_id,
                    data=response,
                ).model_dump(mode="json")
            )
    except WebSocketDisconnect:
        logger.info("interpretation_stream_disconnected")
