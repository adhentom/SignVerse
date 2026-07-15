# Proposed Technology Stack

These choices describe the intended implementation direction. FastAPI, Pydantic Settings, Uvicorn, the official OpenAI Python SDK, Pytest, Ruff, and mypy are configured for the backend; remaining infrastructure choices are not implemented.

| Area | Planned choice |
|---|---|
| Chrome extension | Manifest V3, TypeScript, React, Vite |
| Overlay isolation | Shadow DOM |
| Browser persistence | IndexedDB and `chrome.storage` |
| Extension testing | Playwright with Chrome extension fixtures |
| Backend API | Python 3.12 and FastAPI |
| API contracts | OpenAPI and JSON Schema |
| AI provider | OpenAI Responses API behind a configurable provider boundary |
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

The OpenAI provider is an initial interpretation implementation, not a linguistic-quality approval. Model choice, prompting, Indian language and code-switching behavior, privacy, retention, latency, and cost require evaluation before production use.
