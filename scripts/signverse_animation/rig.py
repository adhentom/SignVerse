"""Retarget MediaPipe observations to the fixed-length hierarchical SignVerse SVG rig."""

from __future__ import annotations

import math
from collections.abc import Sequence
from typing import Any

from .schema import AvatarTransform, ExtractedFrame, Landmark

Point = tuple[float, float]

SHOULDER_WIDTH = 296.0
UPPER_ARM_LENGTH = 118.0
FOREARM_LENGTH = 112.0
REFERENCE_JOINTS: dict[str, Point] = {
    "left-shoulder": (152.0, 265.0),
    "right-shoulder": (448.0, 265.0),
}
FINGER_NAMES = ("thumb", "index", "middle", "ring", "little")
FINGER_CHAINS = (
    (1, 2, 3, 4),
    (5, 6, 7, 8),
    (9, 10, 11, 12),
    (13, 14, 15, 16),
    (17, 18, 19, 20),
)
JOINT_LIMITS = {
    # Projected shoulder angles must remain continuous across the ±180° image
    # boundary. Clamping them at 175° pins a raised arm on the wrong side.
    "left-upper-arm": 360.0,
    "right-upper-arm": 360.0,
    "left-clavicle": 10.0,
    "right-clavicle": 10.0,
    "left-forearm": 155.0,
    "right-forearm": 155.0,
    "left-hand": 100.0,
    "right-hand": 100.0,
    "neck": 18.0,
    "head": 18.0,
    **{
        f"{side}-{finger}-{segment}": 110.0
        for side in ("left", "right")
        for finger in FINGER_NAMES
        for segment in ("mcp", "pip", "dip")
    },
    "left-thumb-cmc": 110.0,
    "right-thumb-cmc": 110.0,
}
MAX_ROTATION_STEP = {
    "left-upper-arm": 30.0,
    "right-upper-arm": 30.0,
    "left-forearm": 45.0,
    "right-forearm": 45.0,
    "left-hand": 50.0,
    "right-hand": 50.0,
    **{
        f"{side}-{finger}-{segment}": 40.0
        for side in ("left", "right")
        for finger in FINGER_NAMES
        for segment in ("mcp", "pip", "dip")
    },
    "left-thumb-cmc": 40.0,
    "right-thumb-cmc": 40.0,
}

RIG_SPEC: dict[str, object] = {
    "name": "signverse-hierarchical-svg",
    "version": "6.0",
    "coordinate_space": "joint-local-degrees",
    "solver": "source-direction-fixed-length",
    "bone_lengths": {
        "upper_arm": UPPER_ARM_LENGTH,
        "forearm": FOREARM_LENGTH,
    },
    "hierarchy": {
        "body": ["torso", "pelvis"],
        "torso": ["neck", "left-clavicle", "right-clavicle"],
        "pelvis": ["left-thigh", "right-thigh"],
        "neck": ["head"],
        "left-clavicle": ["left-upper-arm"],
        "left-upper-arm": ["left-forearm"],
        "left-forearm": ["left-hand"],
        "left-hand": [
            "left-thumb-cmc",
            *[f"left-{name}-mcp" for name in FINGER_NAMES if name != "thumb"],
        ],
        "left-thumb-cmc": ["left-thumb-mcp"],
        **{f"left-{name}-mcp": [f"left-{name}-pip"] for name in FINGER_NAMES},
        **{f"left-{name}-pip": [f"left-{name}-dip"] for name in FINGER_NAMES},
        "right-clavicle": ["right-upper-arm"],
        "right-upper-arm": ["right-forearm"],
        "right-forearm": ["right-hand"],
        "right-hand": [
            "right-thumb-cmc",
            *[f"right-{name}-mcp" for name in FINGER_NAMES if name != "thumb"],
        ],
        "right-thumb-cmc": ["right-thumb-mcp"],
        **{f"right-{name}-mcp": [f"right-{name}-pip"] for name in FINGER_NAMES},
        **{f"right-{name}-pip": [f"right-{name}-dip"] for name in FINGER_NAMES},
    },
    "constraints": {
        "shoulder": [-360.0, 360.0],
        "elbow": [-155.0, 155.0],
        "wrist": [-100.0, 100.0],
        "finger": [-110.0, 110.0],
        "thumb_cmc": [-110.0, 110.0],
        "head": [-18.0, 18.0],
    },
}


def _point(landmarks: Sequence[Landmark], index: int) -> Point | None:
    if index >= len(landmarks):
        return None
    landmark = landmarks[index]
    x, y = landmark.get("x"), landmark.get("y")
    if x is None or y is None:
        return None
    return float(x), float(y)


def _pose_point(
    landmarks: Sequence[Landmark], index: int, minimum_visibility: float = 0.4
) -> Point | None:
    point = _point(landmarks, index)
    if point is None:
        return None
    visibility = landmarks[index].get("visibility")
    if visibility is not None and float(visibility) < minimum_visibility:
        return None
    return point


def _distance(left: Point, right: Point) -> float:
    return math.hypot(right[0] - left[0], right[1] - left[1])


def _angle(left: Point, right: Point) -> float:
    return math.degrees(math.atan2(right[1] - left[1], right[0] - left[0]))


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def _normalize_angle(value: float) -> float:
    return (value + 180.0) % 360.0 - 180.0


def _joint_rotation(value: float, limit: float) -> float:
    return round(_clamp(_normalize_angle(value), -limit, limit), 4)


def _solve_two_bone(
    shoulder: Point,
    observed_elbow: Point,
    target_wrist: Point,
) -> tuple[float, float, float]:
    """Return source-observed segment directions for the fixed-length SVG chain.

    MediaPipe's projected arm proportions change with perspective. Solving only for
    the wrist target can therefore choose the wrong elbow branch or straighten a
    visibly bent arm. The renderer already enforces bone lengths, so preserving
    both observed segment directions is the stable retargeting solution.
    """
    shoulder_angle = _angle(shoulder, observed_elbow)
    forearm_global = _angle(observed_elbow, target_wrist)
    return (
        _joint_rotation(shoulder_angle, 360.0),
        _joint_rotation(forearm_global - shoulder_angle, 155.0),
        forearm_global,
    )


def retarget_frame(frame: ExtractedFrame) -> dict[str, AvatarTransform]:
    """Convert detected landmarks into local joint rotations for the hierarchical rig."""
    pose = frame.pose
    # MediaPipe anatomical right appears on screen-left for a front-facing signer.
    screen_left = tuple(_pose_point(pose, index) for index in (12, 14, 16))
    screen_right = tuple(_pose_point(pose, index) for index in (11, 13, 15))
    left_shoulder, left_elbow, left_wrist = screen_left
    right_shoulder, right_elbow, right_wrist = screen_right
    if left_shoulder is None or right_shoulder is None:
        return {}

    shoulder_width = max(0.04, _distance(left_shoulder, right_shoulder))
    shoulder_center = (
        (left_shoulder[0] + right_shoulder[0]) / 2,
        (left_shoulder[1] + right_shoulder[1]) / 2,
    )

    def map_point(point: Point) -> Point:
        scale = SHOULDER_WIDTH / shoulder_width
        return (
            300.0 + (point[0] - shoulder_center[0]) * scale,
            265.0 + (point[1] - shoulder_center[1]) * scale,
        )

    result: dict[str, AvatarTransform] = {}
    shoulder_tilt = _normalize_angle(_angle(left_shoulder, right_shoulder))
    if shoulder_tilt > 90.0:
        shoulder_tilt -= 180.0
    elif shoulder_tilt < -90.0:
        shoulder_tilt += 180.0
    clavicle_rotation = _joint_rotation(shoulder_tilt, 10.0)
    result["left-clavicle"] = {"rotation": clavicle_rotation}
    result["right-clavicle"] = {"rotation": clavicle_rotation}
    left_angles: tuple[float, float, float] | None = None
    right_angles: tuple[float, float, float] | None = None
    if left_elbow is not None and left_wrist is not None:
        left_angles = _solve_two_bone(
            map_point(left_shoulder), map_point(left_elbow), map_point(left_wrist)
        )
        result["left-upper-arm"] = {
            "rotation": _joint_rotation(left_angles[0] - clavicle_rotation, 360.0)
        }
        result["left-forearm"] = {"rotation": left_angles[1]}
    if right_elbow is not None and right_wrist is not None:
        right_angles = _solve_two_bone(
            map_point(right_shoulder), map_point(right_elbow), map_point(right_wrist)
        )
        result["right-upper-arm"] = {
            "rotation": _joint_rotation(right_angles[0] - clavicle_rotation, 360.0)
        }
        result["right-forearm"] = {"rotation": right_angles[1]}

    # Holistic's right hand is the signer's right hand, displayed screen-left.
    if left_angles is not None:
        _retarget_hand(result, "left", frame.right_hand, left_angles[2])
    if right_angles is not None:
        _retarget_hand(result, "right", frame.left_hand, right_angles[2])
    _retarget_head(result, pose)
    _retarget_face(result, frame.face)
    return result


def _retarget_hand(
    result: dict[str, AvatarTransform],
    side: str,
    hand: Sequence[Landmark],
    forearm_global: float,
) -> None:
    wrist, middle = _point(hand, 0), _point(hand, 9)
    if wrist is None or middle is None:
        return
    hand_global = _angle(wrist, middle)
    result[f"{side}-hand"] = {
        "rotation": _joint_rotation(hand_global - forearm_global, 100.0)
    }
    thumb_points = tuple(_point(hand, index) for index in FINGER_CHAINS[0])
    thumb_cmc = _point(hand, 1)
    if thumb_cmc is not None and all(point is not None for point in thumb_points):
        cmc, mcp, ip, tip = thumb_points
        assert cmc is not None
        assert mcp is not None
        assert ip is not None
        assert tip is not None
        cmc_global = _angle(wrist, cmc)
        mcp_global = _angle(cmc, mcp)
        ip_global = _angle(mcp, ip)
        tip_global = _angle(ip, tip)
        result[f"{side}-thumb-cmc"] = {
            "rotation": _joint_rotation(cmc_global - hand_global, 110.0)
        }
        result[f"{side}-thumb-mcp"] = {
            "rotation": _joint_rotation(mcp_global - cmc_global, 110.0)
        }
        result[f"{side}-thumb-pip"] = {
            "rotation": _joint_rotation(ip_global - mcp_global, 110.0)
        }
        result[f"{side}-thumb-dip"] = {
            "rotation": _joint_rotation(tip_global - ip_global, 110.0)
        }

    for name, indices in zip(FINGER_NAMES[1:], FINGER_CHAINS[1:], strict=True):
        points = tuple(_point(hand, index) for index in indices)
        if any(point is None for point in points):
            continue
        base, middle, distal, tip = points
        assert base is not None
        assert middle is not None
        assert distal is not None
        assert tip is not None
        proximal_angle = _angle(base, middle)
        middle_angle = _angle(middle, distal)
        distal_angle = _angle(distal, tip)
        result[f"{side}-{name}-mcp"] = {
            "rotation": _joint_rotation(proximal_angle - hand_global, 110.0)
        }
        result[f"{side}-{name}-pip"] = {
            "rotation": _joint_rotation(middle_angle - proximal_angle, 110.0)
        }
        result[f"{side}-{name}-dip"] = {
            "rotation": _joint_rotation(distal_angle - middle_angle, 110.0)
        }


def _retarget_head(
    result: dict[str, AvatarTransform], pose: Sequence[Landmark]
) -> None:
    left_ear, right_ear = _point(pose, 8), _point(pose, 7)
    if left_ear is None or right_ear is None:
        return
    tilt = _normalize_angle(_angle(left_ear, right_ear))
    if tilt > 90.0:
        tilt -= 180.0
    elif tilt < -90.0:
        tilt += 180.0
    tilt = _joint_rotation(tilt, 18.0)
    result["neck"] = {"rotation": round(tilt * 0.35, 4)}
    result["head"] = {"rotation": round(tilt * 0.65, 4)}


def _retarget_face(
    result: dict[str, AvatarTransform], face: Sequence[Landmark]
) -> None:
    left_corner, right_corner = _point(face, 61), _point(face, 291)
    upper_lip, lower_lip = _point(face, 13), _point(face, 14)
    if all((left_corner, right_corner, upper_lip, lower_lip)):
        width = max(0.001, _distance(left_corner, right_corner))
        openness = _distance(upper_lip, lower_lip) / width
        result["mouth"] = {"scaleY": round(_clamp(0.7 + openness * 5, 0.7, 2.2), 4)}

    eye_specs = (("left-eye", 33, 133, 159, 145), ("right-eye", 362, 263, 386, 374))
    for part, outer_index, inner_index, top_index, bottom_index in eye_specs:
        outer, inner = _point(face, outer_index), _point(face, inner_index)
        top, bottom = _point(face, top_index), _point(face, bottom_index)
        if all((outer, inner, top, bottom)):
            width = max(0.001, _distance(outer, inner))
            openness = _distance(top, bottom) / width
            result[part] = {"scaleY": round(_clamp(openness * 4.5, 0.08, 1.0), 4)}


def smooth_keyframes(
    keyframes: list[dict[str, Any]], alpha: float = 0.42
) -> list[dict[str, Any]]:
    """Apply an exponential low-pass filter while preserving local joint semantics."""
    if not 0.0 < alpha <= 1.0:
        raise ValueError("alpha must be in (0, 1]")
    previous: dict[tuple[str, str], float] = {}
    smoothed: list[dict[str, Any]] = []
    previous_pose: dict[str, dict[str, float]] = {}
    for keyframe in keyframes:
        # Hold the last detected local joint pose across brief tracking gaps.
        # This preserves attachment and avoids snapping to an unrelated rest pose.
        pose = {part: dict(transform) for part, transform in previous_pose.items()}
        for part, transform in keyframe["pose"].items():
            next_transform: dict[str, float] = {}
            for property_name, raw_value in transform.items():
                value = float(raw_value)
                key = (part, property_name)
                prior = previous.get(key)
                if prior is not None:
                    if property_name == "rotation":
                        limit = JOINT_LIMITS.get(part, 180.0)
                        unwrapped = prior + _normalize_angle(value - prior)
                        # Shoulder motion is an absolute 2D direction and may cross
                        # the ±180° boundary. Local joints cannot cross their
                        # anatomical limit, so interpolate through their valid range.
                        value = (
                            unwrapped
                            if limit > 180.0
                            else unwrapped
                            if -limit <= unwrapped <= limit
                            else _clamp(_normalize_angle(value), -limit, limit)
                        )
                    value = prior + (value - prior) * alpha
                    if property_name == "rotation":
                        maximum_step = MAX_ROTATION_STEP.get(part, 55.0)
                        value = prior + _clamp(
                            value - prior, -maximum_step, maximum_step
                        )
                if property_name == "rotation":
                    limit = JOINT_LIMITS.get(part, 180.0)
                    value = _clamp(value, -limit, limit)
                previous[key] = value
                next_transform[property_name] = round(value, 4)
            pose[part] = next_transform
        previous_pose = pose
        smoothed.append({"offset": keyframe["offset"], "pose": pose})
    return smoothed
