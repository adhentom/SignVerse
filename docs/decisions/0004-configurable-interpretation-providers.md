# ADR 0004: Configurable Interpretation Providers

## Status

Accepted for the initial AI interpretation milestone.

## Context

The `/interpret` endpoint currently returns development mock data. SignVerse needs an AI-backed implementation without coupling HTTP routes to a vendor, changing the `ContentPacket`, exposing credentials to the extension, or breaking the response contract already consumed by the widget.

## Decision

- Introduce an asynchronous `InterpretationProvider` protocol behind the interpretation service.
- Retain the mock provider as the default and select `mock` or `openai` through backend configuration.
- Read `OPENAI_API_KEY` only from the backend environment and fail startup when OpenAI is selected without it.
- Use the official asynchronous OpenAI Python SDK and Responses API.
- Keep the SignVerse ISL system prompt in a dedicated module and treat packet content as untrusted data.
- Request strict JSON-schema output with `store=false`, then validate the returned JSON again with Pydantic.
- Model glossary entries as `{term, definition}` in the provider schema and adapt them to the existing public `string[]` contract.
- Map SDK timeout, rate-limit, and API errors into provider-neutral categories.
- Return the existing empty response as a safe fallback and log only provider/error categories, never packet content.
- Disable SDK retries and keep the provider timeout below the extension timeout budget.

## Consequences

- Providers can be replaced or evaluated without changing routes, packets, or frontend integration.
- Mock-only development and CI require no API key or external network call.
- Strict output validation reduces malformed responses but does not establish ISL linguistic correctness.
- Returning an empty safe fallback preserves compatibility but does not yet communicate provider degradation to users; a future versioned response envelope should add that state.
- Prompts, model versions, cost, latency, and semantic quality require governed evaluation with native ISL users before production release.
