# ADR 0005: Governed Gloss Pipeline Boundary

## Status

Accepted for the linguistic foundation milestone.

## Context

An AI provider can propose a semantic interpretation and ISL-friendly gloss, but model output
does not establish linguistic correctness, regional suitability, provenance, or permission to
use a sign asset. Directly generating animation from probabilistic text would couple uncertain
meaning to irreversible presentation choices and make errors difficult to inspect, reproduce,
or correct.

## Decision

SignVerse separates four explicit stages:

```text
AI Interpretation
→ Governed Gloss
→ Sign Retrieval
→ Avatar Rendering
```

- **AI Interpretation** proposes concepts and uncertainty. It remains provider-specific and
  untrusted until validated.
- **Governed Gloss** resolves concepts to ordered, versioned `ISLToken` values backed by an
  approved lexicon, provenance, regional metadata, and native-review policy.
- **Sign Retrieval** selects only approved sign assets for those tokens and produces an
  auditable playback plan or explicit fallback.
- **Avatar Rendering** realizes the approved plan. It must not reinterpret source meaning or
  silently replace unknown concepts.

The linguistic models and `LexiconProvider` are internal in this milestone. Existing HTTP and
extension contracts remain unchanged. JSON, PostgreSQL, Redis, and remote lexicon providers may
implement the same asynchronous interface in future milestones.

## Alternatives considered

### Generate animation directly from AI output

Rejected because it hides semantic and linguistic decisions inside a generative system,
weakens provenance, complicates regional review, and prevents deterministic fallback.

### Bind gloss labels directly to asset filenames

Rejected because labels change, compounds and variants are context-dependent, and storage
identifiers are not stable linguistic identities.

### Build one provider-specific lexicon integration

Deferred in favor of a storage-neutral protocol so governance semantics do not depend on the
initial persistence technology.

## Consequences

- Linguistic decisions are inspectable, versioned, testable, and independently reviewable.
- Unknown and low-confidence concepts can stop before misleading motion is produced.
- Sign assets and renderers can evolve without changing token identity or AI providers.
- The pipeline adds validation work and latency that must be measured and optimized.
- Native ISL governance, lexicon population, thresholds, non-manual markers, and asset approval
  remain required before this boundary can produce user-ready ISL.
