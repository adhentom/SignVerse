# SignVerse AI — Judge Q&A

## What does SignVerse do?

It captures visible website text or official platform captions, creates a structured semantic
interpretation with Malayalam translation and proposed ISL-friendly gloss, validates gloss
against a governed lexicon, plans available sign assets, and presents the result in an accessible
Chrome overlay.

## Is the avatar currently producing real ISL?

No. The current assets demonstrate renderer, scheduling, fallback, and accessibility behavior.
They are visibly labeled as draft demonstration animations. Production use requires native ISL
review, licensed motion capture, regional metadata, non-manual markers, and comprehension testing.

## Why not let the AI generate animation directly?

Meaning, linguistic governance, sign retrieval, and rendering have different quality and safety
requirements. Separating them makes every proposed token inspectable, allows explicit unsupported
fallback, and lets reviewed assets replace demo motion without changing the AI or API transport.

## How does the architecture work?

Platform adapters normalize inputs into `ContentPacket`. The Manifest V3 background worker owns
network access. FastAPI orchestrates the configured provider, governed validation, and playback
planning. The extension validates the response and independently renders text, Malayalam, gloss,
and the ordered playback sequence.

## What AI model is used?

The configured default is `gpt-5.4-mini` through OpenAI's Responses API. The model is
configuration-driven, so deployments can change it without changing the public API. Tests replace
the SDK client with mocks and never require a real API key.

## Why OpenAI?

The Responses API supports strict JSON-schema output, explicit system instructions, timeouts, and
disabled response storage. Those capabilities fit the typed provider boundary and reduce parsing
risk. SignVerse does not depend on OpenAI for transport, lexicon governance, playback planning, or
rendering; the mock provider proves that separation.

## How do you defend against prompt injection from webpages?

The system prompt identifies every packet field as untrusted data and forbids following embedded
instructions. The provider requires strict JSON schema, Pydantic validates the result, and the
public response is validated again in the extension. This reduces risk but does not replace
ongoing adversarial evaluation.

## Why FastAPI?

FastAPI provides typed Pydantic boundaries, generated OpenAPI documentation, async provider calls,
dependency injection, middleware, and small testable routers with little framework code. It is a
good fit for the current stateless interpretation service and can later sit behind workers and a
streaming gateway.

## Why a Chrome Extension?

An extension can access the visible page and official caption DOM where users already consume
content, then present an isolated Shadow DOM overlay without requiring websites to integrate a new
SDK. Manifest V3 gives a constrained background communication boundary and environment-derived
host permissions.

## Why GLB and VRM?

GLB is a compact, interoperable container for rigged 3D models and animation. VRM adds humanoid
avatar conventions useful for swapping characters and future retargeting. Both remain behind one
renderer interface; the linguistic planner is independent of the visual engine.

## How are Malayalam captions synchronized?

Malayalam translation is a separate interpretation field. In the prototype it is divided across
the planned sign count and highlighted by scheduler position. This is deterministic display
synchronization, not word-level linguistic alignment, and the UI and documentation say so.

## How do Website, YouTube, and Meet differ?

Only acquisition differs. Website mode extracts visible semantic headings and paragraphs.
YouTube observes official caption and player elements. Meet observes caption regions and available
speaker metadata. All three produce the same ContentPacket and use the same backend and widget.

## What happens when captions or assets are missing?

The adapter reports captions disabled or unavailable. The planner lists unsupported concepts
instead of guessing. The renderer shows an accessible fallback for missing, corrupt, timed-out, or
unsupported assets. Demo Mode supplies local fixtures only when explicitly enabled.

## Does Demo Mode change production behavior?

No. It is off by default and locally persisted. When enabled it bypasses backend interpretation
and health calls and uses packaged fixtures. Turning it off restores the production adapter,
service-worker, and FastAPI flow.

## What data is stored?

The extension stores only Demo Mode state, avatar choice, and floating-interpreter geometry.
Extracted text, captions, interpretations, and Malayalam output are ephemeral. Production mode
sends content to the configured backend and, when selected, OpenAI with response storage disabled.

## How does this scale?

The current API is stateless and can run behind a load balancer. Provider calls can be protected
with quotas and moved behind queues for burst control. Approved assets can be versioned on object
storage/CDN. Streaming, Redis coordination, durable sessions, authentication, and observability
are planned boundaries, not claims about the prototype.

## What is the accessibility impact?

The prototype demonstrates how the same content can be exposed as concise text, Malayalam,
concept-oriented gloss, and visual playback in place. It includes keyboard operation, focus
management, reduced motion, high contrast, live status, and explicit fallbacks. Actual impact must
be measured with deaf native ISL users, not inferred from technical completion.

## What is the roadmap?

1. Native ISL governance and comprehension testing.
2. Licensed, consented, region-aware sign capture with facial and hand articulation.
3. Explicit per-site activation, meeting consent, authentication, and operational controls.
4. Reviewed timing and transition metadata plus browser-level platform compatibility tests.
5. Streaming clauses, durable sessions, controlled asset delivery, and measured accessibility
   outcomes.

## What is the strongest technical decision?

AI does not own the final sign. The governed gloss and asset registry are explicit boundaries.
That makes uncertainty and missing coverage visible and lets language experts—not renderer code or
an unconstrained model—become the source of truth.
