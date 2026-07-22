# ADR 0001: ContentPacket and Disposable Live Adapter Sessions

## Status

Accepted for the Chrome extension milestone.

## Context

Static website extraction returns a page-level document, while YouTube captions arrive incrementally and must react to player state and single-page navigation. Platform-specific DOM rules must not leak into the widget or content bootstrap.

## Decision

- Normalize each discrete live item into `ContentPacket<TMetadata>` with platform, title, timestamp, text, and typed platform metadata.
- Extend `PlatformAdapter` with an optional `LiveContentAdapter` capability rather than requiring live behavior from every adapter.
- Let a live adapter create a disposable session that emits complete snapshots and returns a cleanup function.
- Keep observers, media-event listeners, URL rules, history bounds, and platform edge states inside the platform session.
- Keep recent history in memory only and cap YouTube history at 10 unique caption entries.
- Let the content bootstrap subscribe through the generic live capability and pass snapshots to presentation components.

## Consequences

- Generic websites and Google Meet detection remain unaffected by YouTube-specific selectors.
- Future live platforms can reuse the same packet and session contracts while defining their own metadata and observers.
- Cleanup is explicit, reducing stale observers and listeners during extension or React lifecycle changes.
- The current packet contract is local and in-memory; persistence or backend transport would require a separate approved decision.
