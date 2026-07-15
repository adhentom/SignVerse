# Architecture Decisions

This directory will contain Architecture Decision Records (ADRs). Each material decision should record its context, selected option, alternatives, consequences, and approval status.

## Approved initial decisions

1. The MVP begins with user-selected website text; YouTube captions follow; Google Meet is a later phase.
2. Rendering is retrieval-first, using reviewed sign assets before generative avatar motion.
3. The initial backend is a modular monolith supported by separately scalable streaming and inference workers.
4. Native ISL users and qualified language experts govern gloss, lexicon, and output quality.
5. Supplied datasets are quarantined from production use until licensing, provenance, consent, and linguistic quality are verified.
6. The first usable release targets a constrained content domain rather than unrestricted interpretation.
7. The privacy posture is caption-first, explicitly activated, and retains no raw audio by default.

## Accepted implementation decisions

- [ADR 0001: ContentPacket and Disposable Live Adapter Sessions](0001-content-packet-and-live-adapter-sessions.md)
- [ADR 0002: FastAPI Backend Boundary](0002-fastapi-backend-boundary.md)
- [ADR 0003: Background-Owned Backend Transport](0003-background-owned-backend-transport.md)
- [ADR 0004: Configurable Interpretation Providers](0004-configurable-interpretation-providers.md)

## ADR naming convention

Use `NNNN-short-decision-title.md`, beginning with `0001`.
