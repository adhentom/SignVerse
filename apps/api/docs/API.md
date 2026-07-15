# SignVerse API

## `GET /health`

Returns process readiness and identifying metadata.

```json
{
  "status": "ok",
  "service": "signverse-api",
  "version": "0.1.0",
  "environment": "development"
}
```

## `POST /interpret`

Accepts the Chrome extension's unified `ContentPacket`. The timestamp remains a string because platform adapters emit both media timestamps such as `01:05` and wall-clock timestamps such as `10:20:30`.

```json
{
  "platform": "google-meet",
  "title": "Accessibility Stand-up",
  "speaker": "Asha",
  "timestamp": "10:20:30",
  "text": "Welcome to the meeting",
  "metadata": {
    "meetingId": "abc-defg-hij",
    "language": "en-IN"
  }
}
```

The current service returns a deliberately empty mock result:

```json
{
  "summary": "",
  "key_points": [],
  "keywords": [],
  "glossary": [],
  "isl_gloss": [],
  "confidence": 0.0
}
```

Malformed or incomplete packets return FastAPI's standard `422 Unprocessable Entity` response. No request content is persisted or sent to another service.
