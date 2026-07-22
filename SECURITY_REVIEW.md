# Security review

## High-priority open controls

1. `POST /interpret` is unauthenticated and can invoke a paid provider repeatedly.
2. `/stream` is unauthenticated; absent Origin is accepted, and one socket can submit an unlimited sequence of provider-backed messages.

These are deferred because gateway authentication, WAF/rate limits, and deployment exposure are not represented in the repository. They must be verified before Internet exposure. CORS is not authentication.

## Fixed controls

- Recursive metadata limits prevent oversized object-graph and serialization abuse.
- Pending stream replay is bounded and reports backpressure.
- Backend URL schemes are restricted to HTTP(S), credentials in URLs are rejected, and API keys use `SecretStr`.
- OpenAI requests use strict structured output, `store=False`, timeouts, output caps, and disabled SDK retries.
- No dynamic HTML, eval, shell, SQL, archive extraction, or user-selected outbound URL sink was found in the reviewed runtime inventory.

This review is a point-in-time engineering assessment, not a security certification. Use the
private reporting process in `SECURITY.md` for new findings.
