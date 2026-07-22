#!/usr/bin/env python3
"""Download source-approved sign media for later governed asset import."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from urllib.parse import urlparse

from yt_dlp import YoutubeDL

SUPPORTED_HOSTS = {"youtube.com", "www.youtube.com", "youtu.be"}


def download(url: str, destination: Path, license_name: str) -> Path:
    host = urlparse(url).hostname
    if host not in SUPPORTED_HOSTS:
        raise ValueError(f"Unsupported media host: {host or 'missing'}")
    if not license_name.strip():
        raise ValueError("A verified source license is required before download.")

    destination.mkdir(parents=True, exist_ok=True)
    options = {
        "format": "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/best",
        "merge_output_format": "mp4",
        "js_runtimes": {"node": {}},
        "noplaylist": True,
        "outtmpl": str(destination / "%(id)s.%(ext)s"),
        "quiet": True,
        "no_warnings": True,
    }
    with YoutubeDL(options) as downloader:
        info = downloader.extract_info(url, download=True)
        if not isinstance(info, dict) or not info.get("id"):
            raise RuntimeError("yt-dlp returned no media identity.")
        media_id = str(info["id"])

    candidates = sorted(destination.glob(f"{media_id}.*"))
    media_path = next(
        (path for path in candidates if path.suffix.casefold() == ".mp4"), None
    )
    if media_path is None:
        raise RuntimeError("The authorized source did not produce an MP4 asset.")
    provenance = {
        "source_url": url,
        "source_id": media_id,
        "title": str(info.get("title", "")),
        "uploader": str(info.get("uploader", "")),
        "license": license_name.strip(),
        "review_status": "quarantined",
        "media_file": media_path.name,
    }
    media_path.with_suffix(".provenance.json").write_text(
        json.dumps(provenance, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return media_path


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Download an authorized YouTube sign source into quarantine."
    )
    parser.add_argument("url")
    parser.add_argument("--license", required=True, dest="license_name")
    parser.add_argument("--destination", type=Path, default=Path(".asset-quarantine"))
    arguments = parser.parse_args()
    print(download(arguments.url, arguments.destination, arguments.license_name))


if __name__ == "__main__":
    main()
