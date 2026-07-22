# SignVerse AI Backend

This package is the FastAPI interpretation service for SignVerse AI. It exposes health,
interpretation, streaming, and bounded audio-transcription endpoints. A configuration-selected
provider supplies either development mock data or an OpenAI Responses API interpretation with
Malayalam translation. When an OpenAI key is configured, `/transcribe` converts short,
user-authorized tab-audio segments into English captions for the existing interpretation pipeline.

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
| `SIGNVERSE_OPENAI_SEMANTIC_MODEL` | unset | Optional semantic-stage model; falls back to `SIGNVERSE_OPENAI_MODEL` |
| `SIGNVERSE_OPENAI_REALIZATION_MODEL` | unset | Optional Malayalam/ISL realization model; falls back to `SIGNVERSE_OPENAI_MODEL` |
| `SIGNVERSE_OPENAI_TIMEOUT_SECONDS` | `8` | OpenAI SDK request timeout |
| `SIGNVERSE_OPENAI_MAX_OUTPUT_TOKENS` | `1500` | Maximum generated output tokens |
| `SIGNVERSE_OPENAI_TRANSCRIPTION_MODEL` | `gpt-4o-mini-transcribe` | Audio transcription model used by `/transcribe` |
| `SIGNVERSE_OPENAI_TRANSCRIPTION_TIMEOUT_SECONDS` | `20` | Per-segment transcription timeout |
| `SIGNVERSE_OPENAI_SEMANTIC_CACHE_SIZE` | `256` | Process-local duplicate semantic-frame cache; `0` disables it |
| `SIGNVERSE_MINIMUM_SEMANTIC_CONFIDENCE` | `0.55` | Below this, retain subtitles and skip realization |
| `SIGNVERSE_MINIMUM_MALAYALAM_CONFIDENCE` | `0.55` | Below this, omit uncertain Malayalam |
| `SIGNVERSE_MINIMUM_GLOSS_CONFIDENCE` | `0.65` | Below this, omit uncertain ISL gloss/playback |
| `SIGNVERSE_MINIMUM_ASSET_MATCH_CONFIDENCE` | `0.0` | Planner threshold for non-exact asset matches |

The OpenAI provider uses a two-stage Responses API pipeline with strict JSON-schema output and `store=false`. The first call turns the untrusted `ContentPacket` into a validated internal semantic representation. The second call receives only that representation and independently produces natural Malayalam and a sentence-level, concept-oriented ISL gloss. Exact duplicate packets reuse their bounded semantic result, and low-confidence semantics skip the second call. The public API response remains unchanged. SDK retries are disabled; provider timeouts, rate limits, API failures, and malformed output return the existing safe empty response rather than leaking provider details to the client. See [`../../docs/SEMANTIC_INTERPRETATION_PIPELINE.md`](../../docs/SEMANTIC_INTERPRETATION_PIPELINE.md).

For cost/quality tuning, leave both stage overrides unset to use one model, or assign a lower-cost
semantic model and a higher-quality realization model. Every recorded benchmark result must name
both effective model IDs and prompt versions.

## Governed local lexicon

The read-only seed lexicon is stored at `resources/lexicon/lexicon.json`. Its entries are
unreviewed draft candidates with blank provenance and license fields; they are not approved ISL
signs. The internal JSON provider supports deterministic lookup and inventory operations, and
the gloss validator reports support, confidence adjustments, and category coverage. Neither is
used to change AI output.

See [`LEXICON_SCHEMA.md`](../../docs/linguistics/LEXICON_SCHEMA.md) for its schema and governance
rules.

## Sign playback planning

The interpretation service resolves returned gloss labels through the governed lexicon and plans
only assets that have a playable local media or animation path. The public repository contains
project-authored placeholders but no redistributable sign media, so unsupported concepts fail
closed. Authorized deployments can populate the same registry without changing the API contract.

See [`PLAYBACK_ENGINE.md`](../../docs/PLAYBACK_ENGINE.md) for planning and fallback behavior.

See [API.md](docs/API.md) for request and response contracts.
