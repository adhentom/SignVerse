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
