# Real-Time Interpretation Pipeline

## Scope

SignVerse processes content incrementally without changing the existing Manifest V3, background
worker, ContentPacket, or FastAPI `/interpret` contract. Streaming is a client-side queue of small,
ordered packets rather than a WebSocket protocol.

```text
DOM text or official caption update
→ adapter snapshot
→ sentence/paragraph segmentation
→ semantic duplicate suppression
→ ordered ContentPacket queue
→ background worker
→ POST /interpret
→ validated interpretation and playback plan
→ append to active output and playback queue
```

Only one interpretation request is active per page session. This preserves ordering and prevents
provider bursts. A source identity is derived from the page URL, YouTube video ID, or Meet meeting
ID. Navigation clears pending work and ignores late responses from the previous source.

## Website mode

Visible headings and paragraphs are re-extracted after debounced DOM mutations. The sentence
queue remembers previously submitted segments, so a long article starts with its first regions
and later DOM changes submit only new text rather than reposting the full article. The extraction
limit remains 50,000 characters per snapshot.

## YouTube mode

The existing caption observer continuously reads official caption DOM and player events. Semantic
deduplication ignores timestamp-only updates. The session covers watch pages, Shorts, live streams,
ads, caption availability, play/pause/seek events, language metadata, and SPA navigation. After
350 ms of caption stability, the latest completed text enters the ordered queue.

## Google Meet mode

Speaker identity participates in duplicate detection, so identical text from different speakers
remains distinct. Partial caption mutations are debounced; reconnects preserve displayed history,
while meeting identity changes cancel pending work. The adapter retains at most ten caption rows.
Platform DOM does not expose reliable overlap timing, so overlapping speakers are preserved in
arrival order rather than mixed.

## Latency and failure behavior

Local extraction and queueing target sub-500 ms dispatch under normal DOM load. End-to-end latency
also depends on the backend and configured provider, so the target is measured rather than
guaranteed. A failed sentence reports an accessible error; later sentences remain queueable.
Demo Mode continues to bypass all network interpretation and uses packaged output.

No source text, queue, or response history is persisted.
