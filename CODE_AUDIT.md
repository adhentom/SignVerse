# SignVerse AI code audit

## Scope

Reviewed the FastAPI service, MV3 background and content messaging, website/YouTube/Meet adapters, playback queue, asset loading, renderer lifecycle, geometry persistence, manifest, and current documentation. Static security review covered the ranked runtime surface inventory; 20 high-risk rows received full-file review receipts.

## Findings

- Fixed: packaged MP4 files were not listed in `web_accessible_resources`; `signs/*` is now exposed to supported pages.
- Fixed: `ContentPacket.metadata` accepted unbounded recursive objects. Limits now enforce depth 6, 256 nodes, 200-character keys, and 2,000-character strings.
- Fixed: the extension stream replay map had no bound. It now caps at 256 pending packets and reports oldest-drop backpressure.
- Open/high: `/interpret` has no application authentication, rate limiting, or cost quota.
- Open/high: `/stream` has no authentication, connection quota, message rate limit, or concurrency bound. Origin checking is not authentication.
- Residual: REST fallback creates one timer/request per segment during stream failure; long-lived browser stress is still required.
- Residual: playback queue is bounded at 1,000 items but does not yet expose a producer-side acknowledgment for overflow; prolonged sessions need explicit queue consumption/backpressure telemetry.
- Performance: the content bundle is ~1.17 MB (312 KB gzip) because renderer dependencies are eagerly bundled, even when MP4 is the active format.

No code-execution, SQL/command/template injection, SSRF, archive traversal, or XSS sink was found in the reviewed runtime inventory.
