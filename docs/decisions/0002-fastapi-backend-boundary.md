# ADR 0002: FastAPI Backend Boundary

## Status

Accepted for the Phase 2 backend foundation.

## Context

SignVerse needs a stable server boundary before interpretation providers, extension transport, authentication, streaming, or persistence are introduced. The Chrome extension already emits a unified `ContentPacket` whose timestamp formats and platform metadata vary by adapter.

## Decision

- Implement the initial backend as a modular FastAPI monolith under `apps/api`.
- Mirror the extension packet fields at the HTTP boundary, including optional speaker, string timestamp, and arbitrary typed JSON metadata.
- Separate routers, request/response models, service orchestration, configuration, and logging.
- Return a stable empty mock interpretation response from an asynchronous service boundary.
- Load configuration from `SIGNVERSE_` environment variables and reject wildcard credentialed CORS.
- Keep API documentation enabled by configuration and test the public contract independently from the extension.
- Persist no request content and integrate no external provider in this milestone.

## Consequences

- The extension and backend can evolve against an explicit JSON contract without prematurely coupling transport code.
- Provider-specific implementation can replace the mock service behind the router without changing the public endpoint.
- Authentication, rate limits, idempotency, durable sessions, streaming, and schema versioning remain required before production traffic.
- The TypeScript and Pydantic packet definitions are duplicated temporarily; automated cross-language contract generation or conformance testing should follow before integration.
