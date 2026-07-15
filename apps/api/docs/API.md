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

The public response contract remains:

```json
{
  "summary": "",
  "key_points": [],
  "keywords": [],
  "glossary": [],
  "isl_gloss": [],
  "confidence": 0.0,
  "playback": {
    "items": [],
    "unsupported_tokens": []
  }
}
```

`playback.items` preserves governed token order. Each item contains `token_id`, `asset_id`,
nominal `duration` in seconds, and governed `confidence`. `unsupported_tokens` includes unknown
gloss labels and governed tokens without a registered placeholder asset. This is an additive
MVP plan; the API does not return or render media.

Malformed or incomplete packets return FastAPI's standard `422 Unprocessable Entity` response. The backend does not persist request content. When the OpenAI provider is selected, packet content is sent to the OpenAI Responses API with response storage disabled.

With the mock provider, every field is empty. With the OpenAI provider, fields contain the validated interpretation. The model produces structured glossary entries internally; the provider serializes each entry as `term: definition` to preserve the existing public `glossary: string[]` contract used by the extension.

If the selected interpretation provider times out, is rate limited, fails, or returns invalid output, the endpoint returns the safe empty response using the same schema. Provider error details are logged by category without logging packet content.
