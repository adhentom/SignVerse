#!/usr/bin/env python3
"""Import the user-supplied Kaggle animated ISL clips into both runtimes."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import zipfile
from pathlib import Path, PurePosixPath

DATASET_URL = (
    "https://www.kaggle.com/datasets/koushikchouhan/"
    "indian-sign-language-animated-videos"
)
LICENSE = "Kaggle dataset terms - redistribution review pending"


def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.casefold()).strip("-")


def category(word: str) -> str:
    if len(word) == 1 and word.isalpha():
        return "fingerspelling"
    if word.isdigit():
        return "numbers"
    if word.casefold() in {"hello", "welcome", "bye", "thank", "thank you"}:
        return "greetings"
    if word.casefold() in {"college", "learn", "study", "language"}:
        return "education"
    if word.casefold() in {"computer", "homepage", "television", "type"}:
        return "technology"
    if word.casefold() in {
        "come",
        "do",
        "eat",
        "finish",
        "go",
        "help",
        "keep",
        "see",
        "stay",
        "talk",
        "walk",
        "wash",
        "work",
    }:
        return "actions"
    if word.casefold() in {"after", "before", "day", "next", "now", "time"}:
        return "time"
    return "general"


def duration(path: Path) -> float:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return round(float(result.stdout.strip()), 3)


def import_dataset(archive: Path, repository: Path) -> int:
    backend_root = repository / "assets" / "signs"
    extension_root = repository / "apps" / "chrome-extension" / "public" / "signs"
    manifest_path = (
        repository / "apps" / "chrome-extension" / "playback" / "datasetAssets.json"
    )
    backend_root.mkdir(parents=True, exist_ok=True)
    extension_root.mkdir(parents=True, exist_ok=True)

    manifest: list[dict[str, object]] = []
    with zipfile.ZipFile(archive) as source:
        members = sorted(
            (
                member
                for member in source.infolist()
                if member.filename.casefold().endswith(".mp4")
            ),
            key=lambda member: member.filename.casefold(),
        )
        for member in members:
            archive_path = PurePosixPath(member.filename)
            word = archive_path.stem.strip()
            sign_slug = slug(word)
            if not sign_slug or archive_path.name != f"{word}.mp4":
                raise ValueError(f"Unsafe dataset member: {member.filename}")

            token_id = f"dataset-{sign_slug}"
            asset_id = f"kaggle-animated-{sign_slug}-v1"
            asset_directory = backend_root / token_id
            backend_video = asset_directory / f"{sign_slug}.mp4"
            extension_video = extension_root / f"kaggle-{sign_slug}.mp4"
            asset_directory.mkdir(parents=True, exist_ok=True)
            with (
                source.open(member) as input_file,
                backend_video.open("wb") as output_file,
            ):
                shutil.copyfileobj(input_file, output_file)
            shutil.copy2(backend_video, extension_video)
            clip_duration = duration(backend_video)
            asset_category = category(word)

            metadata = {
                "token_id": token_id,
                "asset_id": asset_id,
                "display_name": word,
                "category": asset_category,
                "review_status": "draft",
                "animation_type": "mp4",
                "canonical_gloss": word.upper(),
                "word": word,
                "synonyms": [],
                "language": "ISL",
                "license": LICENSE,
                "duration": clip_duration,
                "version": "1.0",
            }
            (asset_directory / "metadata.json").write_text(
                json.dumps(metadata, indent=2, ensure_ascii=False) + "\n",
                encoding="utf-8",
            )
            manifest.append(
                {
                    "asset_id": asset_id,
                    "token_id": token_id,
                    "canonical_gloss": word.upper(),
                    "word": word,
                    "synonyms": [],
                    "language": "ISL",
                    "category": asset_category,
                    "display_name": word,
                    "format": "mp4",
                    "file_path": f"signs/kaggle-{sign_slug}.mp4",
                    "source": f"signs/kaggle-{sign_slug}.mp4",
                    "duration": clip_duration,
                    "license": LICENSE,
                    "version": "1.0",
                    "review_status": "draft",
                    "transition": "cut",
                    "handshape": "captured in source animation; native ISL review pending",
                    "orientation": "captured in source animation; native ISL review pending",
                    "facial_expression": "captured in source animation; native ISL review pending",
                    "fallback": "neutral-explanation",
                    "metadata": {
                        "dataset": "Indian Sign Language Animated Videos",
                        "dataset_url": DATASET_URL,
                        "duration_verified": True,
                        "is_avatar_animation": True,
                    },
                }
            )

    manifest_path.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return len(manifest)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("archive", type=Path)
    parser.add_argument("--repository", type=Path, default=Path.cwd())
    arguments = parser.parse_args()
    count = import_dataset(arguments.archive.resolve(), arguments.repository.resolve())
    print(f"Imported {count} animated ISL assets")


if __name__ == "__main__":
    main()
