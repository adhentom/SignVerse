# SignVerse AI

SignVerse AI is a planned Chrome extension and backend platform for interpreting digital content into Indian Sign Language (ISL) through an AI-assisted virtual interpreter.

This repository contains the approved architecture scaffold and the Phase 1 Chrome extension foundation. The extension processes visible website text locally and intentionally contains no backend, AI, speech processing, ISL generation, or external API integration.

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

The Chrome extension foundation, local website content extraction, extensible platform detection, and official YouTube live-caption extraction are implemented with Manifest V3, TypeScript, Vite, React, and Tailwind CSS. All remaining product capabilities require explicit phase approval.
