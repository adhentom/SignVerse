# ADR 0003: Background-Owned Backend Transport

## Status

Accepted for the first extension-to-backend integration milestone.

## Context

Website and live-caption adapters create shared `ContentPacket` values, while FastAPI accepts that contract at `/interpret`. Content scripts execute alongside untrusted pages and must not own backend permissions, configuration, or credentials. Manifest V3 service workers may also be suspended between events.

## Decision

- Send versioned, correlated interpretation messages from the content script to the Manifest V3 background service worker.
- Keep all HTTP transport inside a typed, stateless background client.
- Validate packets at the service-worker boundary and validate interpretation responses before returning them to the content script.
- Derive the backend URL and manifest host permission from build-time environment configuration.
- Grant access only to the configured backend origin; an unconfigured build remains network-disabled.
- Abort requests after a configured timeout and return typed configuration, timeout, connection, availability, and response errors.
- Debounce incremental live-caption packets and ignore stale responses in the content-script React lifecycle.
- Display the complete mock interpretation contract in the widget without persisting packets or results.

## Consequences

- Page code cannot invoke the backend directly through SignVerse content-script code.
- Service-worker suspension is safe because each request is self-contained and correlated.
- Backend URL changes require an environment-specific extension build so manifest permissions remain narrow.
- Live caption updates currently use one HTTP request per settled caption update; batching or streaming can be introduced later behind the same boundary.
- Explicit user activation, consent, authentication, retries, rate limiting, schema versioning, and telemetry remain required before production release.
