# Security policy

## Supported versions

SignVerse AI is currently a `0.x` research preview. Security fixes are applied to the latest commit
on `main`; older commits and local dataset imports are not supported.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub's **Report a vulnerability**
private security-advisory flow for `adhentom/SignVerse`. Include affected versions, reproduction
steps, impact, and any suggested mitigation. Do not include real user content or credentials.

The maintainer aims to acknowledge reports within 7 days, provide an initial assessment within
14 days, and coordinate disclosure after a fix is available. These are targets, not guarantees.

## Deployment warning

The development server is not a production security boundary. Before deployment, add user/service
authentication, authorization, rate limits, request-size limits, TLS termination, provider-budget
controls, audit logging, restricted CORS origins, and secret management. Disable API documentation
when it is not required.

## Data and privacy

Website text, captions, and opt-in audio may be sent to the configured backend and provider.
Deployers must disclose this processing, minimize retention, obtain required consent, and avoid
logging content. Never commit `.env` files, provider keys, Google credentials, or captured media.

## Dataset safety

Only explicitly licensed and provenance-tracked assets may be distributed. A public download link
does not establish permission. Native ISL review and performer-consent review are independent
release gates.
