# Final recommendations

1. Put authenticated API/WebSocket ingress and per-user/IP rate, connection, concurrency, and provider-cost quotas in front of the FastAPI service.
2. Add bounded fallback concurrency with cancellation and a single-flight/latest-packet policy when WebSocket streaming is unavailable.
3. Lazy-load Three/VRM/Lottie renderer dependencies; keep MP4 users on a small content bundle.
4. Add browser automation for Wikipedia, YouTube, and Google Meet with packet, queue, playback, and memory telemetry.
5. Replace queue truncation with explicit consumer acknowledgements and a visible overflow metric.
6. Define page/meeting-data consent, retention, redaction, and provider privacy policy before release.
7. Do not claim avatar or platform runtime success until the manual procedures in the verification reports are executed and captured.
