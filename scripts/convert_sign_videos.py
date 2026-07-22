#!/usr/bin/env python3
"""Convert every governed sign MP4 into a reusable landmark AnimationClip."""

from __future__ import annotations

import argparse
from pathlib import Path

from signverse_animation import convert_all, retarget_existing_clips


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repository", type=Path, default=Path.cwd())
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--workers", type=int, default=1)
    parser.add_argument(
        "--retarget-existing",
        action="store_true",
        help="Rebuild clips from retained landmarks without decoding MP4 files.",
    )
    arguments = parser.parse_args()
    repository = arguments.repository.resolve()
    common = {
        "assets_root": repository / "assets" / "signs",
        "extension_output": repository
        / "apps"
        / "chrome-extension"
        / "public"
        / "animations",
        "manifest_path": repository
        / "apps"
        / "chrome-extension"
        / "playback"
        / "animationAssets.json",
    }
    result = (
        retarget_existing_clips(**common)
        if arguments.retarget_existing
        else convert_all(**common, force=arguments.force, workers=arguments.workers)
    )
    print(
        f"Processed {result.discovered} videos: {result.converted} clips, "
        f"{result.fallback_only} MP4 fallbacks, {result.failed} failures"
    )
    if result.failed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
