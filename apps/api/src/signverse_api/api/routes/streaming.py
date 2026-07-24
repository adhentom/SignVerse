import json
import logging
import time

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


async def _send_json(websocket: WebSocket, payload: dict[str, object]) -> bool:
    """Send only while the peer is connected; interpretation may outlive a tab."""
    try:
        await websocket.send_json(payload)
    except (WebSocketDisconnect, RuntimeError):
        logger.info("interpretation_stream_disconnected_before_response")
        return False
    return True


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
        logger.warning(
            "interpretation_stream_origin_rejected",
            extra={"origin": origin, "reason": "cors-origin-not-allowed"},
        )
        await websocket.close(code=1008, reason="Origin is not allowed")
        return
    if development_extension and origin not in allowed_origins:
        logger.warning(
            "interpretation_stream_development_origin_bypass",
            extra={
                "origin": origin,
                "reason": "development-mode-allows-unpacked-extension-origins",
            },
        )
    await websocket.accept()
    logger.info(
        "interpretation_stream_connected",
        extra={
            "origin": origin,
            "client": str(websocket.client),
        },
    )
    service: InterpretationService = websocket.app.state.interpretation_service
    try:
        while True:
            try:
                raw = await websocket.receive_json()
            except json.JSONDecodeError:
                if not await _send_json(
                    websocket,
                    StreamError(
                        code="invalid-message",
                        message="The streaming message was not valid JSON.",
                    ).model_dump(mode="json"),
                ):
                    return
                continue
            try:
                message = StreamRequest.model_validate(raw)
            except ValidationError:
                if not await _send_json(
                    websocket,
                    StreamError(
                        code="invalid-message",
                        message="The streaming message did not match the trusted contract.",
                    ).model_dump(mode="json"),
                ):
                    return
                continue

            if message.type == "reset":
                if not await _send_json(
                    websocket,
                    StreamReset(
                        sequence=message.sequence,
                        session_id=message.session_id,
                    ).model_dump(mode="json"),
                ):
                    return
                continue

            if message.packet is None:  # guarded by StreamRequest validation
                continue
            correlation_id = (
                message.packet.metadata.get("_signverse_correlation_id")
                or f"{message.session_id}:{message.sequence}"
            )
            started_at = time.perf_counter()
            logger.info(
                "interpretation_stream_packet_received",
                extra={
                    "correlation_id": correlation_id,
                    "session_id": message.session_id,
                    "sequence": message.sequence,
                    "platform": message.packet.platform,
                    "text_length": len(message.packet.text),
                },
            )
            try:
                response = await service.interpret(message.packet)
            except Exception:
                logger.exception("interpretation_stream_packet_failed")
                if not await _send_json(
                    websocket,
                    StreamError(
                        sequence=message.sequence,
                        session_id=message.session_id,
                        code="interpretation-failed",
                        message="The streamed packet could not be interpreted.",
                    ).model_dump(mode="json"),
                ):
                    return
                continue
            logger.info(
                "interpretation_stream_packet_processed",
                extra={
                    "correlation_id": correlation_id,
                    "session_id": message.session_id,
                    "sequence": message.sequence,
                    "gloss_count": len(response.isl_gloss),
                    "playback_items": len(response.playback.items),
                    "duration_ms": round((time.perf_counter() - started_at) * 1_000, 2),
                },
            )
            if not await _send_json(
                websocket,
                StreamInterpretation(
                    sequence=message.sequence,
                    session_id=message.session_id,
                    data=response,
                ).model_dump(mode="json", exclude_none=True),
            ):
                return
    except WebSocketDisconnect:
        logger.info(
            "interpretation_stream_disconnected",
            extra={"origin": origin, "client": str(websocket.client)},
        )
