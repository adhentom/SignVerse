# Renderer Verification

## Automated

| Check | Result |
|---|---|
| MP4 preload/cache | PASS |
| Decode-ready mount | PASS |
| Play, pause, resume, speed, and seek | PASS |
| Object URL and DOM cleanup | PASS |
| Next-asset preload | PASS |
| Streaming queue append without reset | PASS |
| Priority within incoming batch | PASS |
| Navigation/seek cancellation | PASS |
| Persisted border-box size and position | PASS |
| Sidebar independence | PASS |
| YouTube watch, live, Shorts, pause, seek, navigation | PASS (DOM integration tests) |
| Google Meet partial captions, speaker changes, reconnect | PASS (DOM integration tests) |
| Website chunk segmentation and mutation extraction | PASS (DOM integration tests) |

## Manual boundary

Automated fixtures cannot prove comprehension of a sign or production behavior inside a real Meet
call. A manual pass still requires reloading the unpacked production build, enabling SignVerse, and
using a captioned YouTube video plus a live Google Meet with two speakers. Only indexed signs can
render; every other gloss must display `Sign unavailable`.
