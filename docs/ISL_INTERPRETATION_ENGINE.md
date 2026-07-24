# ISL Interpretation Engine

## Scope

Phase 3.5 introduces a provider-neutral interpretation domain layer. It does not replace the
current backend provider, caption capture, synchronization engine, overlays, popup, permissions,
or playback runtime. Its output is the existing `PlaybackSequence` contract, so future
rule-based, LLM, or hybrid providers can be selected without changing downstream scheduling and
rendering.

Gloss remains a review notation rather than ISL itself. The engine does not claim that source
word order is ISL grammar, fabricate missing signs, or approve linguistic data automatically.

## Pipeline

```text
SourceContext
  -> SentenceSegmenter
  -> ContextNormalizer
  -> GrammarNormalizer
  -> ISLGlossProvider
  -> GlossOptimizer
  -> VocabularyLookup
  -> UnknownWordHandler / FingerSpeller
  -> AnimationPlanner
  -> PlaybackPlanner
  -> existing PlaybackSequence
```

### Sentence segmentation

`SentenceSegmenter` uses `Intl.Segmenter` where available and has a deterministic punctuation
fallback. It retains source offsets and limits oversized segments without splitting a word when
possible.

### Context and grammar normalization

`ContextNormalizer` performs Unicode and whitespace normalization while retaining the original
text, platform, speaker, locale, and bounded conversation history. `GrammarNormalizer` describes
source-language features such as sentence type, polarity, modality, pronouns, and time markers.
It does not reorder content into unreviewed ISL syntax.

### Provider boundary

`ISLGlossProvider` is the only upstream generation contract. A provider receives normalized
context plus source grammar and returns ordered, confidence-scored gloss candidates.
`GlossProviderRegistry` supports runtime selection by stable provider ID.

`MappingGlossProvider` is a conservative deterministic baseline. It emits only mappings marked
`approved`. It is not the final AI provider and does not infer unseen constructions.

### Optimization, lookup, and fallback

`GlossOptimizer` canonicalizes labels, removes adjacent duplicates, and applies a configurable
confidence floor without changing semantic order. `VocabularyLookup` performs exact and alias
lookup over approved entries only. Ambiguous aliases deliberately produce no match.

`UnknownWordHandler` makes unsupported concepts explicit. Its safe default permits
fingerspelling only for proper nouns. `FingerSpeller` creates character candidates, but those
candidates still require approved character vocabulary and sign metadata before playback.

### Planning

`AnimationPlanner` joins approved vocabulary tokens to approved sign metadata, applies asset
confidence policy, and selects approved transition rules. It emits explicit misses for unknown
glosses, tokens without assets, and unavailable assets.

`PlaybackPlanner` converts that plan into the existing `PlaybackSequence`, including asset IDs,
durations, confidence, transitions, non-manual markers, animation readiness, and unsupported
tokens. The playback queue and synchronization engine remain unchanged.

## Reusable databases

Versioned JSON documents live in `apps/chrome-extension/isl/databases/`:

- `glossMappings.json`: reviewed source phrase to ordered canonical gloss mappings.
- `vocabulary.json`: governed token IDs, concepts, glosses, aliases, categories, regions, and
  review status.
- `signMetadata.json`: approved token-to-asset associations, durations, confidence, versions,
  and animation availability.
- `transitionRules.json`: reviewed category transition timing.

The public repository intentionally starts with no approved linguistic mappings or sign assets.
The default transition timing is renderer metadata, not an ISL linguistic claim. Deployments may
populate these databases only from licensed sources and through the existing native-review
workflow. Pending or rejected entries never reach playback.

## Provider extension

A future provider implements `ISLGlossProvider`:

```ts
interface ISLGlossProvider {
  readonly id: string;
  generate(input: GlossProviderInput): Promise<GlossProviderOutput>;
}
```

The provider may be LLM-backed, rule-based, or hybrid. It must preserve segment identity,
ordering, confidence, category, and non-manual marker provenance. No downstream code should
depend on provider-specific response fields.

## Compatibility and release gates

- No public API or WebSocket schema changes.
- No changes to caption capture or the Phase 3 synchronization engine.
- Existing animation and MP4 fallback selection remain downstream responsibilities.
- Only approved vocabulary and approved sign metadata can be scheduled.
- Native ISL review remains the release gate for gloss mappings, signs, and non-manual grammar.
