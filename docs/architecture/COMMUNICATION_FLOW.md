# Chrome Extension Communication Flow

## Planned flow

```text
Page text or caption event
→ site-specific content adapter
→ validated extension message
→ Manifest V3 service worker
→ authenticated HTTPS or WebSocket backend session
→ incremental gloss and playback-manifest events
→ service worker
→ interpreter overlay
→ local cache lookup
→ CDN asset fetch when missing
→ synchronized playback
```

One-time messages are intended for commands and queries. A long-lived connection is intended for active interpretation sessions. Durable session recovery belongs in browser storage and the backend because the extension service worker may be suspended.

## Planned message envelope

- Schema version.
- Session and segment identifiers.
- Source type and timestamp.
- Language hint.
- Event type and payload.
- Sequence number.
- Confidence value where applicable.
- Correlation identifier.

Messages originating from content scripts must be treated as untrusted. Authentication secrets must not be exposed to the page context.

## Current local YouTube flow

```text
YouTube watch URL
→ AdapterFactory selects YouTubeAdapter
→ YouTubeCaptionSession observes official caption/player DOM
→ video play, pause, seek, time and navigation events update session state
→ captions normalize into ContentPacket values
→ current packet plus last 10 packets form a local snapshot
→ React content bootstrap updates the Shadow DOM widget
```

This flow is fully local. It does not call a backend, external API, speech service, language model, translation system, or avatar renderer.

## Current backend boundary

```text
ContentPacket JSON
→ FastAPI request validation
→ interpretation service boundary
→ mock InterpretationResponse
```

The backend boundary is independently runnable but is not connected to the extension. It performs no external calls and stores no packet content. Authentication, session envelopes, retries, streaming, and extension transport remain future approved work.
