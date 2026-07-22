"""Batch conversion and deterministic AnimationClip serialization."""

from __future__ import annotations

import hashlib
import json
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from .mediapipe_extractor import MediaPipeHolisticExtractor
from .rig import RIG_SPEC, retarget_frame, smooth_keyframes
from .schema import (
    ExtractedFrame,
    VideoExtraction,
    quality_for,
    serialize_frame,
    serialize_quality,
)

CLIP_FILENAME = "AnimationClip.json"


class Extractor(Protocol):
    def extract(self, video_path: Path) -> VideoExtraction: ...


@dataclass(frozen=True, slots=True)
class BatchResult:
    discovered: int
    converted: int
    fallback_only: int
    failed: int
    manifest_path: Path


@dataclass(frozen=True, slots=True)
class ConversionOutcome:
    status: str
    video_path: Path
    asset_id: str = ""
    clip_path: Path | None = None
    manifest_entry: dict[str, object] | None = None
    error: str = ""


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _clip_matches_source(
    clip: object,
    metadata: dict[str, object],
    source_hash: str,
) -> bool:
    if not isinstance(clip, dict):
        return False
    source = clip.get("source")
    keyframes = clip.get("keyframes")
    quality = clip.get("quality")
    quality_valid = False
    if isinstance(quality, dict):
        sampled = int(quality.get("sampled_frames", 0))
        pose = int(quality.get("pose_frames", 0))
        hands = max(
            int(quality.get("left_hand_frames", 0)),
            int(quality.get("right_hand_frames", 0)),
        )
        quality_valid = pose >= max(1, (sampled + 1) // 2) and hands >= max(
            1, (sampled + 19) // 20
        )
    return (
        clip.get("schema") == "signverse.animation-clip"
        and clip.get("schema_version") == "1.1"
        and isinstance(clip.get("rig"), dict)
        and clip["rig"].get("version") == "6.0"
        and clip.get("asset_id") == metadata.get("asset_id")
        and isinstance(source, dict)
        and source.get("sha256") == source_hash
        and isinstance(keyframes, list)
        and len(keyframes) >= 2
        and quality_valid
    )


def build_clip(
    video_path: Path,
    metadata: dict[str, object],
    extraction: VideoExtraction,
) -> dict[str, object] | None:
    quality = quality_for(extraction.frames)
    if not quality.has_sign_motion:
        return None
    frames = []
    keyframes = []
    for frame in extraction.frames:
        serialized = serialize_frame(frame, extraction.duration_ms)
        avatar_pose = retarget_frame(frame)
        serialized["avatar_pose"] = avatar_pose
        frames.append(serialized)
        if avatar_pose:
            keyframes.append({"offset": serialized["offset"], "pose": avatar_pose})
    if not keyframes:
        return None
    keyframes = smooth_keyframes(keyframes)
    if keyframes[0]["offset"] != 0:
        keyframes.insert(0, {"offset": 0, "pose": keyframes[0]["pose"]})
    if keyframes[-1]["offset"] != 1:
        keyframes.append({"offset": 1, "pose": keyframes[-1]["pose"]})
    return {
        "schema": "signverse.animation-clip",
        "schema_version": "1.1",
        "id": f"{metadata['asset_id']}-skeleton-v6",
        "asset_id": metadata["asset_id"],
        "token_id": metadata["token_id"],
        "duration": round(extraction.duration_ms / 1_000, 6),
        "source": {
            "file": video_path.name,
            "sha256": _sha256(video_path),
            "width": extraction.width,
            "height": extraction.height,
            "fps": round(extraction.fps, 6),
            "frame_count": extraction.source_frame_count,
        },
        "extractor": {
            "name": extraction.extractor_name,
            "version": extraction.extractor_version,
            "timing": "one landmark frame per decoded source frame",
        },
        "quality": serialize_quality(quality),
        "rig": RIG_SPEC,
        "keyframes": keyframes,
        "frames": frames,
    }


def _convert_video(
    video_path: Path,
    force: bool,
    extractor: Extractor | None = None,
) -> ConversionOutcome:
    metadata_path = video_path.parent / "metadata.json"
    try:
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        if not isinstance(metadata, dict) or not metadata.get("asset_id"):
            raise ValueError("metadata.json is missing asset_id")
        asset_id = str(metadata["asset_id"])
        clip_path = video_path.parent / CLIP_FILENAME
        if clip_path.exists() and not force:
            clip = json.loads(clip_path.read_text(encoding="utf-8"))
            if not _clip_matches_source(clip, metadata, _sha256(video_path)):
                clip = None
        else:
            clip = None
        if clip is None:
            extraction = (extractor or MediaPipeHolisticExtractor()).extract(video_path)
            clip = build_clip(video_path, metadata, extraction)
            if clip is None:
                clip_path.unlink(missing_ok=True)
                return ConversionOutcome("fallback", video_path, asset_id)
            clip_path.write_text(
                json.dumps(
                    clip,
                    ensure_ascii=False,
                    separators=(",", ":"),
                    allow_nan=False,
                )
                + "\n",
                encoding="utf-8",
            )
        return ConversionOutcome(
            status="converted",
            video_path=video_path,
            asset_id=asset_id,
            clip_path=clip_path,
            manifest_entry={
                "path": f"animations/{asset_id}.json",
                "clip_id": clip["id"],
                "duration": clip["duration"],
                "frame_count": clip["source"]["frame_count"],
                "extractor": clip["extractor"]["name"],
            },
        )
    except (
        OSError,
        ValueError,
        KeyError,
        json.JSONDecodeError,
        RuntimeError,
    ) as error:
        return ConversionOutcome("failed", video_path, error=str(error))


def _convert_worker(arguments: tuple[str, bool]) -> ConversionOutcome:
    video_path, force = arguments
    return _convert_video(Path(video_path), force)


def _write_runtime_clip(source: Path, destination: Path) -> None:
    clip = json.loads(source.read_text(encoding="utf-8"))
    runtime_clip = {
        "schema": clip["schema"],
        "schema_version": clip["schema_version"],
        "id": clip["id"],
        "asset_id": clip["asset_id"],
        "token_id": clip["token_id"],
        "duration": clip["duration"],
        "source": clip["source"],
        "extractor": clip["extractor"],
        "quality": clip["quality"],
        "rig": clip["rig"],
        "keyframes": clip["keyframes"],
    }
    destination.write_text(
        json.dumps(
            runtime_clip,
            ensure_ascii=False,
            separators=(",", ":"),
            allow_nan=False,
        )
        + "\n",
        encoding="utf-8",
    )


def retarget_existing_clip(clip: dict[str, object]) -> dict[str, object]:
    """Rebuild skeletal keyframes from retained raw landmarks without decoding video."""
    raw_frames = clip.get("frames")
    if not isinstance(raw_frames, list) or not raw_frames:
        raise ValueError("canonical clip does not contain retained landmark frames")
    keyframes: list[dict[str, object]] = []
    for raw_frame in raw_frames:
        if not isinstance(raw_frame, dict):
            continue
        landmarks = raw_frame.get("landmarks")
        if not isinstance(landmarks, dict):
            continue
        frame = ExtractedFrame(
            timestamp_ms=int(raw_frame.get("timestamp_ms", 0)),
            pose=list(landmarks.get("pose", [])),
            face=list(landmarks.get("face", [])),
            left_hand=list(landmarks.get("left_hand", [])),
            right_hand=list(landmarks.get("right_hand", [])),
        )
        pose = retarget_frame(frame)
        raw_frame["avatar_pose"] = pose
        if pose:
            keyframes.append(
                {"offset": float(raw_frame.get("offset", 0)), "pose": pose}
            )
    if not keyframes:
        raise ValueError("retargeting produced no skeletal keyframes")
    keyframes = smooth_keyframes(keyframes)
    if keyframes[0]["offset"] != 0:
        keyframes.insert(0, {"offset": 0, "pose": keyframes[0]["pose"]})
    if keyframes[-1]["offset"] != 1:
        keyframes.append({"offset": 1, "pose": keyframes[-1]["pose"]})
    migrated = dict(clip)
    migrated.update(
        {
            "schema_version": "1.1",
            "id": f"{clip['asset_id']}-skeleton-v6",
            "rig": RIG_SPEC,
            "keyframes": keyframes,
        }
    )
    return migrated


def retarget_existing_clips(
    assets_root: Path,
    extension_output: Path,
    manifest_path: Path,
) -> BatchResult:
    """Migrate canonical landmark clips to the current rig deterministically."""
    extension_output.mkdir(parents=True, exist_ok=True)
    clip_paths = sorted(assets_root.glob("*/AnimationClip.json"))
    manifest: dict[str, dict[str, object]] = {}
    converted = failed = 0
    for clip_path in clip_paths:
        try:
            clip = json.loads(clip_path.read_text(encoding="utf-8"))
            if not isinstance(clip, dict):
                raise ValueError("clip root must be an object")
            migrated = retarget_existing_clip(clip)
            clip_path.write_text(
                json.dumps(
                    migrated,
                    ensure_ascii=False,
                    separators=(",", ":"),
                    allow_nan=False,
                )
                + "\n",
                encoding="utf-8",
            )
            asset_id = str(migrated["asset_id"])
            _write_runtime_clip(clip_path, extension_output / f"{asset_id}.json")
            source = migrated.get("source")
            extractor = migrated.get("extractor")
            manifest[asset_id] = {
                "path": f"animations/{asset_id}.json",
                "clip_id": migrated["id"],
                "duration": migrated["duration"],
                "frame_count": source.get("frame_count", 0)
                if isinstance(source, dict)
                else 0,
                "extractor": extractor.get("name", "unknown")
                if isinstance(extractor, dict)
                else "unknown",
            }
            converted += 1
        except (
            OSError,
            ValueError,
            KeyError,
            TypeError,
            json.JSONDecodeError,
        ) as error:
            failed += 1
            print(f"FAILED {clip_path}: {error}")
    manifest_path.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False, allow_nan=False) + "\n",
        encoding="utf-8",
    )
    return BatchResult(
        discovered=len(clip_paths),
        converted=converted,
        fallback_only=0,
        failed=failed,
        manifest_path=manifest_path,
    )


def convert_all(
    assets_root: Path,
    extension_output: Path,
    manifest_path: Path,
    extractor: Extractor | None = None,
    force: bool = False,
    workers: int = 1,
) -> BatchResult:
    if workers < 1:
        raise ValueError("workers must be positive")
    if extractor is not None and workers != 1:
        raise ValueError("custom extractors require workers=1")
    extension_output.mkdir(parents=True, exist_ok=True)
    videos = sorted(assets_root.glob("*/*.mp4"))
    manifest: dict[str, dict[str, object]] = {}
    converted = fallback_only = failed = 0
    if workers == 1:
        outcomes = (_convert_video(video, force, extractor) for video in videos)
        pool = None
    else:
        pool = ProcessPoolExecutor(max_workers=workers)
        outcomes = pool.map(_convert_worker, ((str(video), force) for video in videos))
    try:
        for outcome in outcomes:
            public_path = extension_output / f"{outcome.asset_id}.json"
            if outcome.status == "fallback":
                fallback_only += 1
                public_path.unlink(missing_ok=True)
                continue
            if outcome.status == "failed":
                failed += 1
                print(f"FAILED {outcome.video_path}: {outcome.error}")
                continue
            if outcome.clip_path is None or outcome.manifest_entry is None:
                failed += 1
                print(f"FAILED {outcome.video_path}: converter returned no clip")
                continue
            _write_runtime_clip(outcome.clip_path, public_path)
            manifest[outcome.asset_id] = outcome.manifest_entry
            converted += 1
    finally:
        if pool is not None:
            pool.shutdown()
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False, allow_nan=False) + "\n",
        encoding="utf-8",
    )
    return BatchResult(
        discovered=len(videos),
        converted=converted,
        fallback_only=fallback_only,
        failed=failed,
        manifest_path=manifest_path,
    )
