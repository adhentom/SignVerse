# Changelog

All notable changes to SignVerse AI are documented here.

## [0.1.0] - 2026-07-22

### Added

- Manifest V3 Chrome extension with website, YouTube, and Google Meet adapters.
- Cursor- and selection-aware website interpretation.
- Persistent WebSocket streaming with validated background-worker message passing and REST fallback.
- FastAPI health, interpretation, streaming, and opt-in audio-transcription endpoints.
- Mock and OpenAI Responses API providers with a semantic-first interpretation boundary.
- Natural Malayalam output, governed ISL glosses, confidence gates, and explicit unsupported signs.
- Governed lexicon models, playback planner, renderer interfaces, and branded SVG interpreter.
- Accessibility-focused sidebar, floating interpreter, keyboard behavior, and persisted preferences.
- Dataset import, audit, evaluation, and video-to-landmark conversion tools.
- Backend, extension, animation-tooling tests, and GitHub Actions CI.

### Security and licensing

- Excluded local environments, credentials, build products, raw dataset media, conditional ISLRTC
  catalogs, and source-derived animation clips without established redistribution permission.
- Added security-reporting, contribution, conduct, third-party-notice, and dataset-import guidance.

### Known limitations

- No reviewed sign media ships with the public repository; authorized assets must be imported
  locally and approved by native ISL reviewers.
- The API requires deployment hardening before handling public traffic.
- Browser-platform DOM selectors may require maintenance as YouTube and Google Meet evolve.
