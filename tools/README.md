# SignVerse repository tools

Create the isolated tool environment from a clean checkout:

```bash
python3.12 -m venv tools/.venv
tools/.venv/bin/python -m pip install -r tools/requirements.txt
tools/.venv/bin/graphify install --project --platform codex
tools/.venv/bin/graphify extract . --code-only --out .
```

Query the generated SignVerse architecture graph:

```bash
tools/.venv/bin/graphify query "How does an ISL gloss become an avatar playback asset?"
```

Download only source-approved sign media into quarantine:

```bash
tools/.venv/bin/python scripts/fetch_authorized_sign_media.py \
  "https://www.youtube.com/watch?v=VIDEO_ID" \
  --license "Verified license name"
```

The downloader rejects unsupported hosts and blank licenses. Quarantined media is ignored by Git
and is not indexed for playback until the existing governance and import checks are completed.

Convert the existing governed MP4 library to source-derived avatar clips without network access:

```bash
tools/.venv/bin/python -m pip install -r tools/requirements-animation.txt
PYTHONPATH=scripts tools/.venv/bin/python scripts/convert_sign_videos.py \
  --repository . --workers 4
```

Canonical full-landmark clips stay beside their MP4 sources. The extension receives compact timed
rig keyframes and preserves the MP4 renderer as an automatic fallback.

Analyze configured ISL sources and regenerate the governed vocabulary/index reports without
network access:

```bash
PYTHONPATH=scripts tools/.venv/bin/python scripts/manage_isl_datasets.py \
  --repository . analyze
```

New sources are declared in `config/isl_datasets.json`. CSV, JSON, a standalone MP4, and folder
trees are supported. Analysis is non-destructive. Promotion requires both
`license_status=approved` and a recorded `permission_reference`, refuses overwrites, and can invoke
the existing landmark converter with `promote SOURCE_ID --convert`.

Every source must explicitly declare `language` as `ISL` or `Indian Sign Language` and `region` as
`India`. Intake and promotion fail closed for Indo-Pakistani, Pakistani, or any other sign-language
source. SignVerse does not train a model from these files; approved Indian Sign Language resources
are indexed for governed vocabulary, landmark extraction, and playback only.
