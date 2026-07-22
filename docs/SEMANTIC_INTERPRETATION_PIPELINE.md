# Semantic Interpretation Pipeline

## Purpose

SignVerse separates sentence understanding from language realization. Malayalam and Indian
Sign Language (ISL) outputs must preserve the same interpreted meaning; neither output is a
word-for-word transformation of the English source.

The public `ContentPacket`, `/interpret`, `/stream`, `InterpretationResponse`, lexicon,
playback, and renderer contracts are unchanged.

## Processing order

1. The OpenAI provider submits the untrusted `ContentPacket` to the semantic-analysis stage.
2. Strict schema validation produces an internal `SemanticRepresentation` containing:
   normalized meaning, intent, speech act, discourse register, propositions, participants,
   pronoun resolution, tense, aspect, voice, modality, polarity, emotion, resolved idioms and
   multi-word expressions, conversational context, ambiguity, and semantic confidence.
3. Only the validated semantic representation is submitted to the linguistic-realization
   stage. The original `ContentPacket` is not available to this stage.
4. Malayalam is generated as a natural rendering of the complete meaning.
5. ISL gloss is generated independently from the same meaning representation.
6. The existing governed lexicon validation, asset lookup, playback planning, and renderer
   pipeline process the returned gloss without changes.

```text
ContentPacket
  -> semantic analysis
  -> validated SemanticRepresentation
       -> context-aware Malayalam
       -> concept-oriented ISL gloss
  -> governed lexicon
  -> playback plan
  -> SVG avatar (MP4 fallback)
```

## Context and language behavior

- Idioms and multi-word expressions are resolved to concepts before translation.
- Recent caption history may resolve the current utterance, but old captions are not emitted
  again as new meaning.
- Pronouns are resolved only when the packet context supports a referent; ambiguity is retained
  and lowers interpretation confidence.
- Tense, aspect, negation, questions, modality, and conversational register are explicit inputs
  to both downstream outputs.
- The Malayalam output uses natural Malayalam syntax and meaning-equivalent expressions.
- ISL gloss uses semantic concepts and ISL-friendly ordering instead of English function words.

## Prompt design

Semantic prompt version `2.0.0` requires the model to consume the complete current sentence
before resolving meaning. It handles speaker turns, caption history, passive voice, discourse
markers, fillers, false starts, fragments, phrasal verbs, and non-literal expressions without
performing translation. It cannot silently invent an antecedent or complete a fragment.

Realization prompt version `2.0.0` receives only the validated semantic JSON. Malayalam and ISL
are parallel realizations of that meaning; neither is generated from the other. Malayalam is
instructed to use native syntax and meaning-equivalent expressions. ISL output is one ordered,
sentence-level concept sequence and remains separate from asset vocabulary availability.

## Confidence and fallback

The provider records independent confidence values for semantic parsing, Malayalam realization,
and ISL gloss realization. The unchanged public `confidence` field receives their conservative
minimum.

| Stage | Default threshold | Behavior below threshold |
|---|---:|---|
| Semantic parsing | `0.55` | Skip the realization call; retain source captions and return only normalized summary context. |
| Malayalam | `0.55` | Omit uncertain Malayalam so the original website/video/Meet subtitle remains the fallback. |
| ISL gloss | `0.65` | Omit uncertain gloss so no potentially incorrect playback sequence is created. |
| Asset match | `0.00` | Configurable planner gate; rejected matches are reported as unavailable rather than played. |

Exact governed token-to-asset matches have asset-match confidence `1.0`. Gloss/alias matches use
the dataset confidence with a conservative `0.5` floor. The existing SVG renderer remains the
default, and its validated MP4 source remains the rendering fallback when an animation clip is
missing or cannot be loaded.

## Validation and failure behavior

Both stages use strict JSON Schema and Pydantic validation. A malformed semantic result never
reaches translation or gloss generation. A malformed realization result never reaches the API.
Existing provider error handling returns the established safe empty response for timeouts,
rate limits, API failures, and invalid output.

The two-stage design makes two Responses API calls for a new, sufficiently confident packet. A
bounded in-memory LRU cache reuses validated semantics for exact duplicate packets, reducing a
retry or duplicate-caption path to one realization call while preserving the semantic boundary.
Cache keys are SHA-256 digests, the cache is process-local, and it stores at most 256 semantic
frames by default. Low-confidence semantics skip the second call entirely.

Semantic and realization model IDs can be configured separately. This allows a lower-cost model
for structured parsing and a higher-quality model for Malayalam/ISL realization, or the same
model for both. No model changes alter the public API.

## Renderer selection

The shared SVG interpreter is the default for validated animation clips. Every MP4 asset enters
the SVG adapter first; if no validated animation clip exists or a clip cannot be loaded, the
adapter plays the original validated MP4. No synthetic or dataset-specific avatar animation is
created for missing clips.
