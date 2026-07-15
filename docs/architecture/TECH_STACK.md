# Proposed Technology Stack

These choices describe the intended implementation direction. FastAPI, Pydantic Settings, Uvicorn, Pytest, Ruff, and mypy are now configured for the backend foundation; remaining infrastructure choices are not implemented.

| Area | Planned choice |
|---|---|
| Chrome extension | Manifest V3, TypeScript, React, Vite |
| Overlay isolation | Shadow DOM |
| Browser persistence | IndexedDB and `chrome.storage` |
| Extension testing | Playwright with Chrome extension fixtures |
| Backend API | Python 3.12 and FastAPI |
| API contracts | OpenAPI and JSON Schema |
| Real-time transport | Authenticated WebSocket |
| Background work | Redis with Celery or Dramatiq, selected during implementation planning |
| Primary database | PostgreSQL |
| Semantic retrieval | PostgreSQL with pgvector initially |
| Media delivery | S3-compatible object storage and CDN |
| ML research | PyTorch, Hugging Face, OpenCV, and MediaPipe |
| Media pipeline | FFmpeg and Blender |
| Observability | OpenTelemetry, Prometheus/Grafana, and Sentry |
| Packaging and deployment | Docker and managed containers initially |
| CI/CD | GitHub Actions |

Speech-to-text and language-model providers remain undecided until latency, Indian language support, code-switching behavior, privacy, retention, and cost are benchmarked.
