# Streaming Playback

## Queue behavior

Each sentence interpretation contributes an ordered `PlaybackSequence`. The extension appends new
items to the active sequence. If the existing sequence is an exact prefix, the scheduler preserves
elapsed time and resumes automatically when new items arrive after a temporary `Finished` state.
A source change replaces the sequence and returns playback to `Idle`.

The queue exposes pure `appendPlayback()` and `removeCompleted()` operations. It caps retained
items at 200 to support long sessions without unbounded memory growth.

The controller supports play, pause, resume, restart, previous, next, seek, speed, and replay.
Asset loading remains cached and the next animation is preloaded. Renderer changes are cancellable
and format-neutral.

## Animation registry

Every extension asset entry records:

- token and asset ID;
- format and source;
- reviewed duration;
- transition policy;
- handshape metadata;
- orientation metadata;
- facial-expression metadata;
- review, license, and version state; and
- explicit fingerspelling or neutral-explanation fallback policy.

Draft entries say `pending native ISL review`; they do not invent linguistic metadata.

The [ISL-CSLTR dataset](https://www.kaggle.com/datasets/drblack00/isl-csltr-indian-sign-language-dataset)
is a possible future ingestion source, not a bundled dependency. Before use, its license,
provenance, consent, labels, regional coverage, and redistribution terms must pass the existing
lexicon governance workflow.

## Fallback order

The production design resolves an approved exact sign first, then an approved fingerspelling
sequence, then an accessible neutral explanation. The current repository has no reviewed
fingerspelling clips, so it does not synthesize or mislabel one. Missing clips remain explicit and
the time-based scheduler advances instead of leaving an indefinite frozen pose.

## Malayalam synchronization

Each completed sentence appends its Malayalam translation immediately. The current translation is
shown beneath the avatar, and the existing caption track highlights the portion associated with
the current scheduled item. This proportional segmentation is display synchronization, not a
claim of word-to-sign linguistic alignment.

## Performance targets

Dispatch targets less than 500 ms after stable caption text and playback preparation targets less
than 800 ms when assets are cached. WebGL targets 60 fps with pixel ratio capped at two. These are
targets requiring device and network telemetry, not guaranteed service levels.
