# Performance report

Measured locally on 2026-07-17:

- `/health`: 1.27 ms observed over localhost.
- Mock REST `/interpret`: average 1.381 ms, p95 2.053 ms, peak 23.209 ms over 500 requests.
- Mock WebSocket round trip: average 0.523 ms, p95 0.650 ms, peak 1.017 ms over 100 messages.
- Asset lookup: 100,000 lookups in 108.275 ms (~1.083 µs per lookup).
- Playback planning: average 0.513 ms, p95 1.092 ms over 100 plans.
- Backend RSS: ~49.6 MB while serving the local health endpoint.
- Extension content bundle: 1,170.07 kB raw / 312.27 kB gzip.

These are mock/local measurements, not OpenAI latency, real browser FPS, or multi-user capacity. OpenAI latency and renderer FPS require live-provider/browser runs. The main optimization is lazy-loading Three/VRM/Lottie paths so MP4-only users do not pay their startup/bundle cost.
