# Memory analysis

Controls verified: renderer destroys adapters and revokes MP4 object URLs; observers and event listeners disconnect on adapter/session stop; asset-load promises are evicted on failure; geometry observers/timers clean up; pending stream packets are capped at 256; packet metadata is bounded recursively; playback queue is capped at 1,000.

Residual risks: fallback timers and REST requests are created per segment while disconnected; `seen`, `completed`, and fallback maps are session-scoped but can grow until reset/unmount; renderer dependency bundle is large; long-lived queue overflow is bounded by truncation rather than explicit producer acknowledgment. Manual Chrome stress is required to measure heap growth over hours.
