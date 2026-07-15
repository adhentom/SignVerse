# SignVerse AI Backend

This package is the Phase 2 FastAPI interpretation service for SignVerse AI. It exposes health and interpretation endpoints using the Chrome extension's `ContentPacket` contract. A configuration-selected provider supplies either development mock data or an OpenAI Responses API interpretation. Speech, translation, avatar, and animation services are not implemented.

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

The mock provider is enabled by default. To use OpenAI, set these values in the ignored local `.env` file:

```text
SIGNVERSE_INTERPRETATION_PROVIDER=openai
OPENAI_API_KEY=<your-local-key>
SIGNVERSE_OPENAI_MODEL=gpt-5.4-mini
```

Never commit the populated `.env` file. The application fails at startup if the OpenAI provider is selected without a key.

## Quality commands

```bash
ruff check .
ruff format --check .
mypy
pytest
```

## Configuration

Settings use the `SIGNVERSE_` prefix and can be supplied through environment variables or a local `.env` file. CORS origins must be a JSON array; wildcard origins are intentionally rejected when credentials are enabled.

For an unpacked extension, set `SIGNVERSE_CORS_ORIGINS` to a JSON array containing its `chrome-extension://<extension-id>` origin. Production environments should list only approved extension and web origins.

| Variable | Default | Purpose |
|---|---|---|
| `SIGNVERSE_ENVIRONMENT` | `development` | Runtime environment label |
| `SIGNVERSE_LOG_LEVEL` | `INFO` | Python logging level |
| `SIGNVERSE_CORS_ORIGINS` | local development origins | Allowed extension/web origins |
| `SIGNVERSE_DOCS_ENABLED` | `true` | Enables `/docs`, `/redoc`, and `/openapi.json` |
| `SIGNVERSE_INTERPRETATION_PROVIDER` | `mock` | Selects `mock` or `openai` |
| `OPENAI_API_KEY` | unset | OpenAI credential, required only for the OpenAI provider |
| `SIGNVERSE_OPENAI_MODEL` | `gpt-5.4-mini` | Responses API model identifier |
| `SIGNVERSE_OPENAI_TIMEOUT_SECONDS` | `8` | OpenAI SDK request timeout |
| `SIGNVERSE_OPENAI_MAX_OUTPUT_TOKENS` | `1500` | Maximum generated output tokens |

The OpenAI provider uses the Responses API with strict JSON-schema output and `store=false`. SDK retries are disabled so the backend timeout remains below the extension request budget. Provider timeouts, rate limits, API failures, and malformed output return the existing safe empty response rather than leaking provider details to the client.

## Governed local lexicon

The read-only seed lexicon is stored at `resources/lexicon/lexicon.json`. Its entries are
unreviewed draft candidates with blank provenance and license fields; they are not approved ISL
signs. The internal JSON provider supports deterministic lookup and inventory operations, and
the gloss validator reports support, confidence adjustments, and category coverage. Neither is
connected to the public API or OpenAI provider in this milestone.

See [`LEXICON_SCHEMA.md`](../../docs/linguistics/LEXICON_SCHEMA.md) for its schema and governance
rules.

See [API.md](docs/API.md) for request and response contracts.
