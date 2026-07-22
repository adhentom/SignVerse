# Playback Engine

```text
ContentPacket → OpenAI interpretation → governed gloss validation → deterministic lookup
→ PlaybackSequence → streaming append queue → cached asset loader → format renderer
```

The backend planner emits ordered items with token ID, asset ID, measured duration, confidence,
and optional priority. The extension preserves the active queue when new WebSocket responses
arrive, orders only each incoming batch by priority, preloads the next asset, and supports play,
pause, resume, restart, previous, next, seek, speed, cancel, and continuous append.

Navigation or seeking resets the stream and cancels the current response queue. Pause preserves
elapsed time. Media is cached by immutable asset ID. The MP4 renderer uses the real packaged sign
video; Lottie and SVG adapters remain format alternatives, while GLB is an explicit interface stub.

No demo path or placeholder fallback participates in production. A missing mapping is reported as
`Sign unavailable` with its exact token and lookup reason.
