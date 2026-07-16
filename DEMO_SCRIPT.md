# SignVerse AI — Five-Minute Demo Script

## 0:00–0:35 — The problem

“Digital information is still inaccessible to many deaf and hard-of-hearing people in India.
Captions help, but written-language captions are not a replacement for Indian Sign Language.
SignVerse explores a safer path: capture available text, understand meaning, propose governed
ISL concepts, and retrieve reviewed sign motion.”

Show the extension loaded in Chrome and the healthy FastAPI `/health` response.

## 0:35–1:15 — Architecture

“The page never calls our backend directly. A site adapter creates one typed ContentPacket. The
Manifest V3 service worker validates it and sends it to FastAPI. FastAPI selects a mock or OpenAI
provider, validates proposed gloss against our governed lexicon, plans available sign assets, and
returns one typed response.”

Point to the platform indicator and pipeline stages in the sidebar.

## 1:15–2:15 — Deterministic offline experience

Turn on **Demo Mode**.

“Demo Mode is disabled by default and stored locally. For a reliable hackathon demonstration it
uses packaged sample content, Malayalam translation, ISL-friendly gloss, and local animation. It
makes no interpretation or health request while active.”

Expand Summary, Malayalam Translation, Keywords, Glossary, and ISL Playback. Copy the Malayalam
translation. Mention that content and results are not persisted.

## 2:15–3:10 — Playback and accessibility

Press Play, pause, seek, change speed, and choose another avatar profile. Drag and resize the
floating interpreter.

“Playback order comes from the backend planner; the renderer cannot change linguistic meaning.
The same scheduler can load Lottie, SVG sequences, GLB, or VRM assets. Position, size, and avatar
choice persist locally. Keyboard controls, reduced motion, high contrast, focus management, live
regions, and explicit missing-sign fallbacks are built in.”

State clearly: “These animations are demonstration motion, not validated ISL signs.”

## 3:10–4:10 — Live platform architecture

Turn Demo Mode off only if the backend and prepared page are available; otherwise keep it on and
switch through prepared platform screenshots.

“The adapter factory automatically selects generic websites, YouTube watch pages, or Google Meet.
Website mode reads visible semantic text and excludes hidden, scripted, and common advertising
content. YouTube reads official caption elements and tracks play, pause, seek, ads, and navigation.
Meet captures available speaker changes, reconnect state, and a ten-entry caption history.”

Explain that repeated timestamp updates are deduplicated so the same caption does not repeatedly
call the backend.

## 4:10–4:45 — Responsible AI and governance

“OpenAI produces strict structured JSON through the Responses API. The prompt treats page content
as untrusted, preserves meaning, and separates natural Malayalam from concept-oriented ISL gloss.
The model does not directly animate. AI proposal, governed gloss, sign retrieval, and rendering
are deliberately separate so native reviewers can control the language layer.”

Show confidence and unsupported concepts.

## 4:45–5:00 — Close

“SignVerse is a working accessibility architecture and hackathon prototype, not a certified
interpreter. Our next step is not more AI—it is native ISL review, licensed sign capture, deaf-user
comprehension testing, and explicit consent for live use. The platform is designed so those
validated assets can replace today’s demo motion without rewriting the pipeline.”
