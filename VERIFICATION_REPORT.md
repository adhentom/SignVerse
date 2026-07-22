# Production Pipeline Verification

## Automated verification

| Check | Result |
|---|---|
| Extension TypeScript | PASS |
| Extension tests | PASS — 23 files, 59 tests |
| Extension production build | PASS |
| Backend Ruff lint | PASS |
| Backend Ruff formatting | PASS |
| Backend mypy | PASS |
| Backend pytest | PASS — 47 tests, 97.19% coverage |
| Demo Mode absent from production source | PASS |
| Demonstration Lottie asset removed | PASS |
| Generic GLB sign mappings removed | PASS |
| Generic placeholder assets excluded | PASS |
| Supplied/official dataset assets indexed | PASS — 9 |
| MP4 dataset renderer | PASS — loader/factory/build tests |
| Unmatched gloss reported unsupported | PASS |
| WebSocket default / REST fallback | PASS (automated); Chrome runtime pending |

## Browser verification

The rebuilt unpacked extension must be manually reloaded before Chrome evidence is valid. Wikipedia, YouTube, and Google Meet runtime checks and screenshots are therefore **PENDING**, not claimed.

## Dataset lookup and interpreter

| Claim | Result |
|---|---|
| Searchable dataset index | PASS — six exact numeric mappings; review state remains draft |
| Real dataset playback | PASS for mapped numeric assets; broader coverage remains unavailable |
| Production 2D interpreter | BLOCKED — reviewed hand/finger/face/timing assets are absent |
| Honest unavailable state | PASS — missing/draft assets produce no playback and remain unsupported |

## Required evidence to unblock

Provide the referenced PDF/CSV plus per-source redistribution license, performer consent, canonical token mapping, regional/variant metadata, checksums, durations, and native ISL review decisions. Browser verification does not remove these linguistic and rights blockers.
