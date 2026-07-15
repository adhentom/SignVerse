import pytest
from httpx import AsyncClient

PACKET = {
    "platform": "google-meet",
    "title": "Accessibility Stand-up",
    "speaker": "Asha",
    "timestamp": "10:20:30",
    "text": "Welcome to the meeting",
    "metadata": {"meetingId": "abc-defg-hij", "language": "en-IN"},
}


@pytest.mark.anyio
async def test_interpret_accepts_extension_content_packet(client: AsyncClient) -> None:
    response = await client.post("/interpret", json=PACKET)

    assert response.status_code == 200
    assert response.json() == {
        "summary": "",
        "malayalam_translation": "",
        "key_points": [],
        "keywords": [],
        "glossary": [],
        "isl_gloss": [],
        "confidence": 0.0,
        "playback": {"items": [], "unsupported_tokens": []},
    }


@pytest.mark.anyio
async def test_interpret_accepts_packet_without_optional_speaker(client: AsyncClient) -> None:
    packet = {key: value for key, value in PACKET.items() if key != "speaker"}
    response = await client.post("/interpret", json=packet)

    assert response.status_code == 200


@pytest.mark.anyio
async def test_interpret_rejects_missing_or_empty_content(client: AsyncClient) -> None:
    missing_text = {key: value for key, value in PACKET.items() if key != "text"}

    missing_response = await client.post("/interpret", json=missing_text)
    empty_response = await client.post("/interpret", json={**PACKET, "text": "   "})
    assert missing_response.status_code == 422
    assert empty_response.status_code == 422


@pytest.mark.anyio
async def test_cors_allows_configured_extension_origin(client: AsyncClient) -> None:
    response = await client.options(
        "/interpret",
        headers={
            "Origin": "chrome-extension://test-extension",
            "Access-Control-Request-Method": "POST",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "chrome-extension://test-extension"
