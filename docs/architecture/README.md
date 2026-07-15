# Architecture

## Direction

SignVerse AI will use a retrieval-first interpretation pipeline. Website text or captions are preferred over audio. Input is normalized and segmented, translated into a reviewed ISL gloss representation, validated, and then mapped to approved sign assets. Fully generated avatar motion is a later capability, not an MVP dependency.

## Planned system boundaries

### Chrome extension

- Site-specific content adapters for generic websites, YouTube, and Google Meet.
- A Manifest V3 service worker for permissions, session coordination, authentication state, and backend communication.
- An isolated interpreter overlay for synchronized playback and accessibility controls.
- Local asset and preference storage.
- An optional live-session capability on platform adapters for event-driven content such as YouTube captions.

### Backend

- API and orchestration layer for authentication, consent, validation, quotas, and session lifecycle.
- Streaming gateway for incremental interpretation, ordering, reconnection, and backpressure.
- Workers for speech-to-text, language processing, asset retrieval, media composition, and future avatar inference.
- PostgreSQL for transactional metadata, object storage and CDN for media, and Redis for ephemeral coordination.

The current backend is a modular FastAPI application under `apps/api`. It exposes `/health` and `/interpret`, validates the extension's `ContentPacket`, and keeps routing, services, providers, prompts, models, configuration, and structured logging separate. Interpretation uses a configuration-selected mock or OpenAI provider. The extension communicates with `/interpret` only through its background service worker. Durable state, streaming, authentication, and workers are not implemented.

### Interpretation pipeline

```text
Input acquisition
→ language identification
→ transcription when required
→ text normalization and clause segmentation
→ contextual ISL gloss generation
→ lexicon and grammar validation
→ confidence assessment
→ validated sign retrieval or explicit fallback
→ playback manifest
→ extension overlay
```

## Architectural constraints

- The extension must not rely on a permanently running service worker.
- Content-script input is untrusted and must be validated.
- The backend owns durable interpretation session state.
- Provider-specific STT and language-model integrations remain behind internal boundaries.
- Raw datasets and model artifacts do not belong in Git.
- Human review by native ISL users and qualified language experts is required for language assets and product evaluation.

## Local content contracts

Platform adapters normalize discrete live content into a shared `ContentPacket` containing platform, title, timestamp, text, and platform metadata. Event-driven adapters expose a disposable live session; the content bootstrap subscribes through the generic adapter capability and passes snapshots to the isolated overlay. Platform DOM selectors, observers, and edge-state logic remain inside the platform adapter.

Backend transport uses a separate versioned and correlated runtime-message envelope. The background service worker validates packets before network transport, applies environment-derived host permissions, enforces timeouts, validates backend responses, and returns typed errors without exposing network access to the content script.
