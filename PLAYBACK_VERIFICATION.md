# Playback Verification

## Root cause

Playback stopped between governed gloss validation and the playback planner. The backend sign
registry indexed only `approved` metadata, but the repository contained only draft SVG
placeholders. The extension registry was intentionally empty. As a result, every governed token
was returned in `unsupported_tokens` and the renderer never received an asset.

## Implemented path

```text
Platform adapter
→ ContentPacket
→ OpenAI interpretation and Malayalam translation
→ governed gloss resolution
→ exact token_id dataset lookup
→ PlaybackSequence
→ extension asset lookup
→ MP4 renderer
→ floating interpreter
```

The initial searchable index contains nine exact mappings from supplied and official ISLRTC media:

| Governed token | Asset ID | Media |
| --- | --- | --- |
| `number-zero` | `dataset-number-zero-v1` | `number-zero.mp4` |
| `number-one` | `dataset-number-one-v1` | `number-one.mp4` |
| `number-two` | `dataset-number-two-v1` | `number-two.mp4` |
| `number-three` | `dataset-number-three-v1` | `number-three.mp4` |
| `number-four` | `dataset-number-four-v1` | `number-four.mp4` |
| `number-five` | `dataset-number-five-v1` | `number-five.mp4` |
| `number-ten` | `islrtc-number-ten-v1` | `number-ten.mp4` |
| `greeting-yes` | `islrtc-yes-v1` | `greeting-yes.mp4` |
| `time-yesterday` | `islrtc-yesterday-v1` | `time-yesterday.mp4` |

Matching is exact and deterministic. No semantic approximation, generated motion, or fabricated
sign fallback is used. Generic placeholder SVGs remain excluded. Dataset provenance is the
user-supplied collection; redistribution licensing and native ISL review remain pending, so the
entries are visibly labelled `draft`.

## Results

| Check | Result | Evidence |
| --- | --- | --- |
| Backend registry load | PASS | 9 dataset media assets indexed |
| Exact governed lookup | PASS | `number-one` resolves to `dataset-number-one-v1` |
| Planner queue population | PASS | Six-number API sample returned six ordered items |
| Missing-token reporting | PASS | Unmatched tokens remain in `unsupported_tokens` |
| Extension asset registry | PASS | 9 exact asset IDs packaged |
| MP4 renderer selection | PASS | Renderer factory and blob loader tests |
| Production packaging | PASS | Six MP4 files present under `dist/signs/` |
| Floating size persistence | PASS | ResizeObserver persists manual dimensions |
| Floating position persistence | PASS | Drag/keyboard position stored in `chrome.storage.local` |
| Sidebar independence | PASS | Sidebar starts closed; toggling does not unmount the interpreter |
| Wikipedia live UI | PENDING | Requires reloading the newly built unpacked extension |
| YouTube live UI | PENDING | Requires a caption-enabled video and newly loaded build |
| Google Meet live UI | PENDING | Requires an active meeting with captions and newly loaded build |

### Coverage statistics

- Mapped signs: **9**
- Missing signs in the controlled six-number sample: **0**
- Unsupported tokens in the controlled six-number sample: **0**
- Playback success rate for the controlled mapped sample: **100% (6/6)**
- Full lexicon or arbitrary-content success rate: **not claimed**; it depends on whether generated
  glosses match the six imported tokens.

## Limitations and next dataset work

The supplied collection is much larger than this safely traceable subset, but no authoritative
CSV mapping or redistribution license was available in the repository. Bulk filename matching
would create unreviewed linguistic claims. Before expanding the index, obtain the authoritative
token-to-file manifest, licensing terms, and native ISL reviewer sign-off. Add each accepted file
using the same exact `token_id` contract; the planner and renderer require no redesign.
