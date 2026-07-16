from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from signverse_api.app import create_app
from signverse_api.config import Settings


def test_streams_ordered_interpretations_and_reset_acknowledgement() -> None:
    app = create_app(Settings(environment="test", interpretation_provider="mock"))
    with TestClient(app) as client, client.websocket_connect("/stream") as websocket:
        websocket.send_json(
            {
                "type": "content",
                "sequence": 1,
                "session_id": "session-1",
                "packet": {
                    "platform": "youtube",
                    "title": "Demo",
                    "timestamp": "00:01",
                    "text": "Welcome.",
                    "metadata": {"videoId": "abc"},
                },
            }
        )
        response = websocket.receive_json()
        assert response["type"] == "interpretation"
        assert response["sequence"] == 1
        assert response["session_id"] == "session-1"
        assert response["data"]["malayalam_translation"] == ""

        websocket.send_json({"type": "reset", "sequence": 2, "session_id": "session-2"})
        assert websocket.receive_json() == {
            "type": "reset",
            "sequence": 2,
            "session_id": "session-2",
        }


def test_rejects_invalid_stream_messages_without_closing_connection() -> None:
    app = create_app(Settings(environment="test", interpretation_provider="mock"))
    with TestClient(app) as client, client.websocket_connect("/stream") as websocket:
        websocket.send_json({"type": "content", "sequence": 0, "session_id": "session-1"})
        error = websocket.receive_json()
        assert error["type"] == "error"
        assert error["code"] == "invalid-message"


def test_rejects_unapproved_websocket_origins() -> None:
    app = create_app(
        Settings(
            environment="test",
            interpretation_provider="mock",
            cors_origins=["chrome-extension://approved"],
        )
    )
    with TestClient(app) as client:
        try:
            with client.websocket_connect(
                "/stream", headers={"origin": "https://untrusted.example"}
            ):
                raise AssertionError("Unapproved origin unexpectedly connected")
        except WebSocketDisconnect as error:
            assert error.code == 1008
