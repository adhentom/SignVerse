"""AnimationClip schema primitives shared by the converter and tests."""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass, field
from typing import TypedDict


class Landmark(TypedDict, total=False):
    x: float
    y: float
    z: float
    visibility: float


class AvatarTransform(TypedDict, total=False):
    # Joint-local rotation is the canonical skeletal property. The remaining
    # values are reserved for root motion and facial deformation.
    x: float
    y: float
    rotation: float
    scaleX: float
    scaleY: float
    opacity: float


@dataclass(slots=True)
class ExtractedFrame:
    timestamp_ms: int
    pose: list[Landmark] = field(default_factory=list)
    face: list[Landmark] = field(default_factory=list)
    left_hand: list[Landmark] = field(default_factory=list)
    right_hand: list[Landmark] = field(default_factory=list)


@dataclass(slots=True)
class VideoExtraction:
    width: int
    height: int
    fps: float
    duration_ms: int
    source_frame_count: int
    frames: list[ExtractedFrame]
    extractor_name: str
    extractor_version: str


@dataclass(frozen=True, slots=True)
class ClipQuality:
    sampled_frames: int
    pose_frames: int
    face_frames: int
    left_hand_frames: int
    right_hand_frames: int

    @property
    def has_sign_motion(self) -> bool:
        minimum_pose = max(1, math.ceil(self.sampled_frames * 0.5))
        minimum_hand = max(1, math.ceil(self.sampled_frames * 0.05))
        return self.pose_frames >= minimum_pose and (
            self.left_hand_frames >= minimum_hand
            or self.right_hand_frames >= minimum_hand
        )


def quality_for(frames: list[ExtractedFrame]) -> ClipQuality:
    return ClipQuality(
        sampled_frames=len(frames),
        pose_frames=sum(bool(frame.pose) for frame in frames),
        face_frames=sum(bool(frame.face) for frame in frames),
        left_hand_frames=sum(bool(frame.left_hand) for frame in frames),
        right_hand_frames=sum(bool(frame.right_hand) for frame in frames),
    )


def serialize_frame(frame: ExtractedFrame, duration_ms: int) -> dict[str, object]:
    return {
        "timestamp_ms": frame.timestamp_ms,
        "offset": round(min(1.0, frame.timestamp_ms / max(1, duration_ms)), 6),
        "landmarks": {
            "pose": frame.pose,
            "face": frame.face,
            "left_hand": frame.left_hand,
            "right_hand": frame.right_hand,
        },
    }


def serialize_quality(quality: ClipQuality) -> dict[str, int]:
    return asdict(quality)
