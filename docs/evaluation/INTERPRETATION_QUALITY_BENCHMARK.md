# Interpretation Quality Benchmark

## Scope

`benchmarks/interpretation_quality.jsonl` contains 200 deterministic cases derived from 50
meaning scenarios and four real-world caption variants. It covers:

- greetings and routine conversations;
- education and technical explanations;
- questions, requests, commands, and negation;
- emotional expression;
- idioms and phrasal meaning;
- active and passive voice;
- conversational fillers, corrections, fragments, and multi-speaker reference.

Each case stores source text, platform, context, expected semantic fields, Malayalam reference,
ordered sentence-level ISL gloss, and governance status. The generator is
`scripts/generate_interpretation_benchmark.py`; generation is deterministic and must produce
exactly 200 unique IDs and source strings.

## Governance limitation

All current references are marked `candidate-native-review-required`. They are useful for
engineering regression detection, but they are not linguistic ground truth. A qualified native
Malayalam reviewer must approve translation fluency, and native ISL reviewers must approve gloss
concept choice, order, regional usage, and non-manual requirements before any case changes to
`native-reviewed`.

Tests deliberately enforce this label. SignVerse must not misrepresent synthetic references as
validated accessibility output.

## Metrics

The evaluator reports:

- semantic accuracy: exact categorical agreement plus aspect/modality token F1;
- translation similarity: character-trigram F1 against the reviewed reference;
- Malayalam fluency proxy: Malayalam-script coverage with a repetition penalty;
- gloss correctness: ordered positional agreement combined with token F1 and length agreement;
- exact gloss rate;
- asset coverage of expected gloss tokens;
- missing predictions and native-reviewed case count.

Translation similarity and script coverage are regression proxies, not measures of native
fluency. Human comprehension remains the release criterion.

## Running an evaluation

Capture model outputs as JSONL conforming to `BenchmarkPrediction`, then run:

```bash
PYTHONPATH=apps/api/src apps/api/.venv/bin/python \
  scripts/evaluate_interpretation_quality.py predictions.jsonl \
  --output evaluation-results.json
```

The command exits non-zero when predictions are missing. Store the model ID, both prompt
versions, date, and configuration beside every result artifact.

## Regression policy

- Schema, category, uniqueness, and metric behavior run in ordinary `pytest` without an API key.
- Prompt contract tests require coverage of the language phenomena listed above.
- A model or prompt update may not lower a native-reviewed metric below its accepted baseline.
- Candidate-only scores may guide development but cannot approve a production release.
- Reviewers must inspect failures; a higher lexical score cannot override a meaning error.
