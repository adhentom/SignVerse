# End-to-End ISL Evaluation

## Scope

The checked-in benchmark contains 200 candidate cases spanning website, YouTube, and Google Meet content, including greetings, conversation, education, technical explanations, questions, commands, negation, emotion, idioms, and incomplete live captions. Cases are marked `candidate-native-review-required`; they are regression fixtures, not linguistic ground truth.

## Metrics

- Semantic accuracy compares intent, speech act, tense, aspect, modality, polarity, emotion, and voice.
- Malayalam similarity and script fluency are automated regression proxies.
- Gloss correctness combines token overlap, order, and sequence length.
- Asset coverage and animation readiness report validated rendering availability.
- Avatar continuity is supplied by a playback run (0 means discontinuous, 1 means no detected reset/detachment).
- Mean and p95 latency record measured end-to-end processing time.

## Platform protocol

For each release, sample at least ten real reading contexts per platform with consent and lawful access. Capture source text/caption, timestamp, interpretation, queue trace, renderer trace, and latency. Google Meet tests must use a controlled meeting with consenting participants; recordings and captions must not enter the repository.

Native ISL reviewers score meaning preservation, grammar, sign choice, non-manual accuracy, and intelligibility. Native Malayalam reviewers score meaning, fluency, register, and conversational naturalness. Automated metrics detect regressions but never replace these reviews.

## Release gates

- No regression from the last native-reviewed benchmark.
- No fabricated sign for an unsupported gloss.
- No detached skeletal joints in the continuity test set.
- No duplicate playback after seek, reading-context change, or reconnect.
- p95 latency is reported separately for website, YouTube, and Google Meet.
