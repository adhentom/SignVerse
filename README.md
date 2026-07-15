# SignVerse AI

SignVerse AI is a planned Chrome extension and backend platform for interpreting digital content into Indian Sign Language (ISL) through an AI-assisted virtual interpreter.

This repository contains the approved architecture scaffold, the Phase 1 Chrome extension, and the Phase 2 backend foundation. The extension can send validated content packets through its background service worker to the configured FastAPI backend. AI, speech, translation, avatar, and ISL generation integrations are not implemented.

## Planned product flow

```text
Speech / website text / captions
→ speech-to-text when required
→ context understanding and segmentation
→ ISL gloss generation and validation
→ sign asset or virtual-interpreter planning
→ Indian Sign Language presentation
```

## Repository areas

- `apps/` — planned user-facing and deployable applications.
- `services/` — planned interpretation pipeline boundaries.
- `packages/` — planned shared contracts and domain packages.
- `ml/` — planned dataset, experimentation, evaluation, and inference areas.
- `data/` — planned reviewed lexicon, gloss rules, and mappings.
- `infrastructure/` — planned deployment, monitoring, and security definitions.
- `tests/` — planned contract, browser, accessibility, performance, and model-quality tests.
- `docs/` — approved architecture, decisions, privacy, dataset governance, and evaluation documentation.
- `tools/` — planned internal dataset and annotation tooling.

## Current status

The Chrome extension foundation, website extraction, platform detection, and live-caption extraction for YouTube and Google Meet are implemented. The background service worker posts shared `ContentPacket` values to FastAPI, which can use the default mock provider or a configured OpenAI Responses API provider. The validated response is displayed by the widget.

Backend setup and API documentation are available in [`apps/api/README.md`](apps/api/README.md).
