# SignVerse AI Backend

This package is the Phase 2 FastAPI foundation for SignVerse AI. It exposes health and mock interpretation endpoints using the Chrome extension's `ContentPacket` contract. It does not call AI, speech, translation, avatar, or external services.

## Requirements

- Python 3.12 or newer

## Local setup

From `apps/api`:

```bash
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -e '.[dev]'
cp .env.example .env
uvicorn signverse_api.main:app --reload
```

The service listens on `http://127.0.0.1:8000`. Interactive OpenAPI documentation is available at `/docs` and the schema at `/openapi.json` while `SIGNVERSE_DOCS_ENABLED=true`.

## Quality commands

```bash
ruff check .
ruff format --check .
mypy
pytest
```

## Configuration

Settings use the `SIGNVERSE_` prefix and can be supplied through environment variables or a local `.env` file. CORS origins must be a JSON array; wildcard origins are intentionally rejected when credentials are enabled.

| Variable | Default | Purpose |
|---|---|---|
| `SIGNVERSE_ENVIRONMENT` | `development` | Runtime environment label |
| `SIGNVERSE_LOG_LEVEL` | `INFO` | Python logging level |
| `SIGNVERSE_CORS_ORIGINS` | local development origins | Allowed extension/web origins |
| `SIGNVERSE_DOCS_ENABLED` | `true` | Enables `/docs`, `/redoc`, and `/openapi.json` |

See [API.md](docs/API.md) for request and response contracts.
