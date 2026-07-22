# ISL Interpretation Architecture

## Purpose

SignVerse treats Indian Sign Language as a language, not a word-substitution display. The public API remains backward compatible (`isl_gloss` is still an ordered string list), while the internal realization plan carries phrase boundaries, discourse roles, referents, classifiers, emphasis, confidence, and non-manual markers.

## Runtime flow

1. A website reading block, YouTube caption, or Google Meet caption becomes a `ContentPacket`.
2. Semantic analysis resolves intent, participants, pronouns, tense, aspect, modality, polarity, idioms, ambiguity, emotion, and meaningful phrase units.
3. Malayalam is realized from that semantic representation, not from token substitution.
4. ISL phrase planning orders concepts by discourse function and linguistic context. It does not mechanically preserve English SVO order.
5. The flattened gloss list preserves the existing API. The internal `isl_segments` plan preserves phrase-level information.
6. The governed lexicon and asset manager validate each gloss. Unsupported or low-confidence units use text/subtitle fallback; SignVerse never invents a sign.
7. Playback items inherit phrase identity, transition duration, non-manual markers, and animation readiness.
8. The renderer blends the previous skeletal pose into the next validated clip while applying current phrase facial grammar.

## Linguistic realization rules

- Establish time and topic before the comment when context requires it.
- Resolve pronouns to discourse referents before choosing index/location behavior.
- Scope negation over the predicate and pair it with a head-shake marker.
- Mark yes/no questions with raised brows and information questions with lowered brows where linguistically reviewed.
- Preserve emphasis and emotion as non-manual behavior rather than extra English words.
- Use classifier candidates only when the semantic representation and governed linguistic data support them.
- Segment incomplete live captions conservatively and retain preceding conversational context.

These are implementation constraints, not a claim that generated output is native-reviewed ISL. Glosses and non-manual rules require ongoing review by Deaf ISL experts and regional signers.

## Confidence and safe fallback

The response may include independent scores for semantic accuracy, Malayalam translation, gloss correctness, asset matching, animation readiness, and avatar confidence. The configured asset-match threshold prevents uncertain mappings from becoming animated assertions. A missing validated asset is surfaced explicitly and the original text/Malayalam subtitle remains available.

## Compatibility

The Chrome extension, REST and WebSocket transports, legacy mock provider, MP4 fallback, asset registry, and public request model are unchanged. New response fields are optional and omitted when unavailable.

## Roadmap

1. Native ISL reviewers approve phrase plans, regional variants, classifiers, and non-manual scope.
2. Native Malayalam reviewers convert candidate benchmark cases into versioned ground truth.
3. Motion reviewers score handshape, location, orientation, movement, and non-manual fidelity per clip.
4. Discourse state becomes an explicit, privacy-bounded session model for multi-turn caption interpretation.
5. Quality thresholds are calibrated from reviewer outcomes rather than model confidence alone.
6. Renderer continuity metrics incorporate wrist velocity, joint jerk, handshape transition accuracy, and comprehensibility testing.
