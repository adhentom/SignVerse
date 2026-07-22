# Google Meet Pipeline

The primary path observes Google Meet's live-caption DOM. Every mutation is read immediately with
no trailing debounce. Exact duplicate captions are ignored; when Meet extends the current caption,
only the appended text is sent. Speaker changes create a new history entry and packet identity.

```text
Meet caption DOM → speaker/text/language packet → WebSocket → Malayalam + ISL gloss
→ governed lookup → playback append → preloaded MP4 renderer
```

Reconnects preserve caption history while pausing playback. Leaving or navigating to a different
meeting resets the stream and queue. Captions remain the preferred path because they are lower
latency and more reliable than microphone capture.

An optional future STT provider may implement the same `ContentPacket` boundary when captions are
unavailable. It is deliberately not instantiated, permissioned, or enabled in this milestone.
