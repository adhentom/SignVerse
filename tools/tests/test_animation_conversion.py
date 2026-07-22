from __future__ import annotations

import json
import math
from pathlib import Path

import pytest
from signverse_animation.converter import (
    build_clip,
    convert_all,
    retarget_existing_clip,
)
from signverse_animation.rig import (
    FOREARM_LENGTH,
    REFERENCE_JOINTS,
    UPPER_ARM_LENGTH,
    retarget_frame,
    smooth_keyframes,
)
from signverse_animation.schema import ExtractedFrame, VideoExtraction


def landmark(x: float, y: float) -> dict[str, float]:
    return {"x": x, "y": y, "z": 0.0, "visibility": 1.0}


def source_frame(timestamp_ms: int = 0, with_hand: bool = True) -> ExtractedFrame:
    pose = [landmark(0.5, 0.1) for _ in range(33)]
    for index, point in {
        11: (0.65, 0.3),
        12: (0.35, 0.3),
        13: (0.75, 0.5),
        14: (0.25, 0.5),
        15: (0.8, 0.7),
        16: (0.2, 0.7),
    }.items():
        pose[index] = landmark(*point)
    hand = [landmark(0.2 + index * 0.005, 0.7 - index * 0.01) for index in range(21)]
    return ExtractedFrame(
        timestamp_ms=timestamp_ms,
        pose=pose,
        face=[landmark(0.5, 0.2) for _ in range(478)],
        right_hand=hand if with_hand else [],
    )


def extraction(with_hand: bool = True) -> VideoExtraction:
    return VideoExtraction(
        width=640,
        height=480,
        fps=25,
        duration_ms=80,
        source_frame_count=2,
        frames=[source_frame(0, with_hand), source_frame(40, with_hand)],
        extractor_name="test-holistic",
        extractor_version="1",
    )


def test_retargeting_moves_arms_and_individual_fingers() -> None:
    pose = retarget_frame(source_frame())

    assert "left-upper-arm" in pose
    assert "right-forearm" in pose
    assert "left-clavicle" in pose
    assert "left-index-mcp" in pose
    assert "left-index-pip" in pose
    assert "left-index-dip" in pose
    assert "left-thumb-cmc" in pose
    assert pose["left-thumb-cmc"]["rotation"] == pytest.approx(0, abs=0.001)
    assert pose["left-index-pip"]["rotation"] == pytest.approx(0, abs=0.001)
    assert pose["left-index-dip"]["rotation"] == pytest.approx(0, abs=0.001)
    assert "left-little-mcp" in pose
    assert set(pose["left-upper-arm"]) == {"rotation"}
    assert set(pose["left-forearm"]) == {"rotation"}

    shoulder = REFERENCE_JOINTS["left-shoulder"]
    shoulder_angle = pose["left-upper-arm"]["rotation"]
    elbow_angle = shoulder_angle + pose["left-forearm"]["rotation"]
    elbow = (
        shoulder[0] + math.cos(math.radians(shoulder_angle)) * UPPER_ARM_LENGTH,
        shoulder[1] + math.sin(math.radians(shoulder_angle)) * UPPER_ARM_LENGTH,
    )
    wrist = (
        elbow[0] + math.cos(math.radians(elbow_angle)) * FOREARM_LENGTH,
        elbow[1] + math.sin(math.radians(elbow_angle)) * FOREARM_LENGTH,
    )
    assert math.dist(shoulder, elbow) == pytest.approx(UPPER_ARM_LENGTH)
    assert math.dist(elbow, wrist) == pytest.approx(FOREARM_LENGTH)
    assert shoulder_angle == pytest.approx(116.5651, abs=0.001)
    assert pose["left-forearm"]["rotation"] == pytest.approx(-12.5288, abs=0.001)


def test_clip_preserves_source_timing_and_landmarks(tmp_path: Path) -> None:
    video = tmp_path / "hello.mp4"
    video.write_bytes(b"validated-video")
    clip = build_clip(
        video, {"asset_id": "hello", "token_id": "greeting-hello"}, extraction()
    )

    assert clip is not None
    assert clip["duration"] == 0.08
    assert clip["frames"][1]["timestamp_ms"] == 40
    assert len(clip["frames"][0]["landmarks"]["pose"]) == 33
    assert len(clip["frames"][0]["landmarks"]["face"]) == 478
    assert clip["source"]["sha256"]
    assert clip["schema_version"] == "1.1"
    assert clip["rig"]["solver"] == "source-direction-fixed-length"


def test_smoothing_crosses_shoulder_wrap_without_pinning_and_holds_tracking_gaps() -> (
    None
):
    smoothed = smooth_keyframes(
        [
            {"offset": 0, "pose": {"left-upper-arm": {"rotation": 170}}},
            {"offset": 0.5, "pose": {}},
            {"offset": 1, "pose": {"left-upper-arm": {"rotation": -170}}},
        ],
        alpha=0.5,
    )

    assert smoothed[1]["pose"]["left-upper-arm"]["rotation"] == 170
    assert smoothed[2]["pose"]["left-upper-arm"]["rotation"] == 180


def test_smoothing_caps_implausible_single_frame_elbow_flips() -> None:
    smoothed = smooth_keyframes(
        [
            {"offset": 0, "pose": {"left-forearm": {"rotation": 155}}},
            {"offset": 1, "pose": {"left-forearm": {"rotation": -155}}},
        ],
        alpha=0.5,
    )

    assert smoothed[1]["pose"]["left-forearm"]["rotation"] == 110


def test_low_visibility_arm_is_ignored_without_discarding_the_valid_arm() -> None:
    frame = source_frame()
    frame.pose[15]["visibility"] = 0.1

    pose = retarget_frame(frame)

    assert "left-upper-arm" in pose
    assert "left-forearm" in pose
    assert "right-upper-arm" not in pose
    assert "right-forearm" not in pose


def test_existing_landmarks_can_be_retargeted_without_decoding_video(
    tmp_path: Path,
) -> None:
    video = tmp_path / "hello.mp4"
    video.write_bytes(b"validated-video")
    original = build_clip(
        video, {"asset_id": "hello", "token_id": "greeting-hello"}, extraction()
    )
    assert original is not None
    original["schema_version"] = "1.0"

    migrated = retarget_existing_clip(original)

    assert migrated["id"] == "hello-skeleton-v6"
    assert migrated["rig"]["version"] == "6.0"
    assert migrated["rig"]["hierarchy"]["body"] == ["torso", "pelvis"]
    assert migrated["rig"]["hierarchy"]["pelvis"] == [
        "left-thigh",
        "right-thigh",
    ]
    assert migrated["rig"]["hierarchy"]["torso"] == [
        "neck",
        "left-clavicle",
        "right-clavicle",
    ]
    assert migrated["rig"]["hierarchy"]["left-clavicle"] == ["left-upper-arm"]
    assert migrated["rig"]["hierarchy"]["left-thumb-cmc"] == ["left-thumb-mcp"]
    assert migrated["rig"]["hierarchy"]["left-index-mcp"] == ["left-index-pip"]
    assert migrated["rig"]["hierarchy"]["left-index-pip"] == ["left-index-dip"]
    assert "x" not in migrated["keyframes"][0]["pose"]["left-upper-arm"]


def test_batch_writes_manifest_and_keeps_mp4_fallback_for_missing_hands(
    tmp_path: Path,
) -> None:
    assets = tmp_path / "assets"
    public = tmp_path / "public"
    manifest = tmp_path / "animationAssets.json"
    for name in ("hello", "no-hands"):
        directory = assets / name
        directory.mkdir(parents=True)
        (directory / f"{name}.mp4").write_bytes(name.encode())
        (directory / "metadata.json").write_text(
            json.dumps({"asset_id": name, "token_id": name}), encoding="utf-8"
        )

    class FakeExtractor:
        def extract(self, video_path: Path) -> VideoExtraction:
            return extraction(with_hand=video_path.stem != "no-hands")

    result = convert_all(assets, public, manifest, extractor=FakeExtractor())
    generated = json.loads(manifest.read_text(encoding="utf-8"))

    assert result.discovered == 2
    assert result.converted == 1
    assert result.fallback_only == 1
    assert result.failed == 0
    assert generated["hello"]["path"] == "animations/hello.json"
    runtime_clip = json.loads((public / "hello.json").read_text(encoding="utf-8"))
    assert "keyframes" in runtime_clip
    assert "frames" not in runtime_clip
    assert not (assets / "no-hands" / "AnimationClip.json").exists()


def test_batch_reextracts_when_the_validated_source_changes(tmp_path: Path) -> None:
    assets = tmp_path / "assets"
    directory = assets / "hello"
    directory.mkdir(parents=True)
    video = directory / "hello.mp4"
    video.write_bytes(b"version-one")
    (directory / "metadata.json").write_text(
        json.dumps({"asset_id": "hello", "token_id": "hello"}), encoding="utf-8"
    )

    class CountingExtractor:
        calls = 0

        def extract(self, _video_path: Path) -> VideoExtraction:
            self.calls += 1
            return extraction()

    extractor = CountingExtractor()
    arguments = (assets, tmp_path / "public", tmp_path / "manifest.json")
    convert_all(*arguments, extractor=extractor)
    video.write_bytes(b"version-two")
    convert_all(*arguments, extractor=extractor)

    assert extractor.calls == 2
