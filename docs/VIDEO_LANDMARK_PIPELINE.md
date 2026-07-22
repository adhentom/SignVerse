# Video-to-Landmark Conversion Pipeline

## Flow

```text
validated assets/signs MP4
  -> decode every source frame with OpenCV
  -> MediaPipe Holistic pose + face + left/right hands
  -> preserve source timestamp and landmark arrays
  -> shoulder-relative landmark normalization
  -> fixed-length two-bone arm IK and local joint rotations
  -> constrained temporal smoothing
  -> hierarchical SVG-rig retargeting
  -> canonical AnimationClip.json
  -> compact extension runtime clip + manifest
```

The converter uses the open-source MediaPipe Holistic models bundled with the pinned Python
package. It performs no network access and does not inspect, download, or create sign datasets.

## Setup and batch conversion

From the repository root:

```bash
tools/.venv/bin/python -m pip install -r tools/requirements-animation.txt
PYTHONPATH=scripts tools/.venv/bin/python scripts/convert_sign_videos.py \
  --repository . --workers 4
```

Use `--force` only when the extractor or retargeting algorithm changes. Otherwise the converter
checks the source SHA-256 and reuses valid clips. A changed video, malformed clip, or stale hash is
automatically reprocessed. Worker processes isolate MediaPipe tracking state between videos.

When raw landmarks already exist in canonical clips, retarget them without decoding the source
videos again:

```bash
PYTHONPATH=scripts tools/.venv/bin/python scripts/convert_sign_videos.py \
  --repository . --retarget-existing
```

## Validation and fallback

A clip requires pose detection in at least 50% of frames and either hand in at least 5% of frames.
This threshold prevents a face-only or body-only detection from being labeled as sign animation.
Failures are explicit in the batch summary. Assets without a verified clip are excluded from the
animation manifest and continue through the existing MP4 renderer.

The conversion is a 2D skeletal retargeting of source motion. The runtime never applies MediaPipe
coordinates directly to SVG shapes. Fixed bone lengths and nested parent-child transforms preserve
anatomical attachment; IK approximates each observed wrist target within reachable constraints.
Depth, occlusion, self-contact, and fine finger curvature can still be less accurate than the
source motion. Canonical raw landmarks are retained so a future reviewed rig or 3D renderer can be
generated without re-decoding the dataset.

## Renderer integration

`AssetRegistry` attaches an optional runtime clip path by `asset_id`. `RendererFactory` keeps the
branded `Avatar2DAdapter` as the primary interpreter. The adapter validates and caches the JSON,
mounts the hierarchical SVG skeleton, and applies the existing scheduler's play/pause/seek/speed
calls. Source videos are not rendered as the primary interpreter; the existing MP4 path remains a
failure fallback when a validated animation clip cannot load.

No backend model, API response, gloss mapping, queue, or WebSocket contract changes are required.
