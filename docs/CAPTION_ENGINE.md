# Synchronized Caption Engine

The SignVerse caption engine keeps source captions, interpretation packets, and avatar playback on
one deterministic timeline.

## Source timing

YouTube packets retain the formatted player timestamp and add millisecond metadata:

- `playbackTimeMs` — player position when the cue was observed;
- `captionStartMs` and optional `captionEndMs` — cue boundaries;
- `captionSource` — `youtube-dom`, `youtube-track`, or `tab-audio`; and
- `cueId` — stable identity for partial updates to one cue.

Official transcript tracks provide exact start and end times. Visible YouTube captions use the
player position at the first partial update. Appended words retain the original cue identity and
replace the history entry in place. Seeking resets the active DOM cue.

Tab-audio messages include the recorded segment duration. The content script derives the audio
caption start from the current player position and records both boundaries. Adjacent normalized
duplicates are suppressed, while the same phrase can be accepted again after a later segment.

## Central synchronization timeline

`SynchronizationTimeline` is the single media clock for timestamped captions and avatar motion.
When an interpretation response returns, the extension adds browser-local timing annotations to
its playback items using the originating packet's cue ID, caption boundaries, and source text.
This does not change the backend response contract.

Validated sign durations are proportionally scheduled inside the source cue's timestamp window.
The same scheduled index drives the avatar pose, floating caption, sidebar caption highlight,
timeline progress, and current-sign label. Captions are buffered by request and cue identity, so a
newly arriving packet does not replace the caption still associated with the active sign.

The timeline anchors itself to the source player's position and advances between player events
using `performance.now()` and the source playback rate. Supported rates are clamped to 0.25×–2×.
Pause, resume, seek, and advertisement states come from the source clock:

- pause and advertisements hold the clock without latching the user's manual pause state;
- resume continues automatically from the latest media anchor;
- seeking performs an immediate hard correction while retaining already buffered playback; and
- normal clock drift above 120 ms is corrected gradually, while drift above one second is treated
  as a hard discontinuity.

For websites and sources without a media timestamp, the existing relative sign-duration scheduler
remains the deterministic fallback.

## Caption rendering

The sidebar caption track scrolls the active segment into view. The floating caption uses a short
update transition and an atomic polite live region. Both smooth scrolling and transition motion
respect the user's reduced-motion preference.

When developer diagnostics are explicitly enabled in a development build, the playback card shows
timing metrics only: media time, drift, playback rate, buffer depth, correction counts, seek
resets, late items, and media state. Caption text, semantic output, and user content are not added
to synchronization diagnostics.

## Validation

Focused tests cover:

- official DOM and transcript-track timestamps;
- partial cue replacement and bounded history;
- recorded audio timing;
- stable cue deduplication and later repeated speech;
- duration-weighted caption segmentation; and
- timestamp-based caption/avatar boundary alignment;
- 0.25×–2× source-rate awareness;
- pause, advertisement, resume, and seek recovery;
- drift detection and smooth or hard correction; and
- late-item and prebuffer behavior.

Run the complete extension gate from the repository root:

```bash
npm run check
```
