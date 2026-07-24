# Production ISL Interpretation Provider

## Purpose

Phase 4 adds the production provider boundary for the TypeScript
`InterpretationEngine`. The provider accepts normalized source context and grammar units,
requests candidate concepts from a swappable inference backend, and admits only governed
vocabulary into downstream animation and playback planning.

It does not replace caption capture, synchronization, overlays, the playback scheduler,
animation planning, permissions, or popup behavior.

## Architecture

```text
SentenceSegmenter
  -> ContextNormalizer
  -> GrammarNormalizer
  -> ProductionInterpretationProvider
       -> GlossInferenceBackend
            -> SignVerse API / OpenAI / local model / reviewed rules
       -> approved VocabularyLookup
       -> governed FingerSpeller fallback
       -> per-segment confidence and diagnostics
  -> GlossOptimizer
  -> defensive VocabularyLookup
  -> existing AnimationPlanner
  -> existing PlaybackPlanner
  -> PlaybackSequence
```

`InterpretationProvider` extends the provider contract consumed by the engine and exposes a
stable backend ID. `GlossInferenceBackend` is the replaceable inference boundary. The
production provider has no OpenAI SDK dependency and never reads credentials; OpenAI remains
behind the existing FastAPI service.

`ApiGlossInferenceBackend` adapts the existing `POST /interpret` response into candidate
segments. It deliberately ignores playback items returned by the API. All candidates must pass
the local governed vocabulary check and existing planners before they can become a new
`PlaybackSequence`.

## Governance guarantees

- Pending, rejected, missing, or ambiguous vocabulary never becomes a candidate.
- Provider-suggested asset IDs are ignored.
- Exact and alias matches are canonicalized to the approved vocabulary entry.
- Unknown words are fingerspelled only when every required character has an approved
  `fingerspelling` vocabulary entry.
- Partial fingerspelling sequences are rejected atomically.
- Low-confidence inference is rejected before planning.
- The `InterpretationEngine` repeats governed lookup as a defensive downstream boundary.
- Animation and playback planning remain responsible for approved token-to-asset resolution.

## Diagnostics

Every inferred segment reports:

- segment ID and confidence;
- all received gloss labels;
- accepted canonical glosses;
- concepts resolved through governed fingerspelling;
- rejected glosses with explicit reasons;
- optional inference-backend diagnostics.

Aggregate diagnostics identify the production provider and active inference backend. They do
not contain credentials or provider-specific secrets.

## Backend substitution

To add an OpenAI, local-model, or rule-based implementation, implement:

```ts
interface GlossInferenceBackend {
  readonly id: string;
  infer(input: GlossProviderInput): Promise<GlossInferenceResult>;
}
```

The backend can then be passed to `ProductionInterpretationProvider`. No vocabulary, animation,
playback, renderer, or synchronization changes are required.
