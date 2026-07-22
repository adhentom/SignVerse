"""MediaPipe Holistic video extractor using package-bundled open-source models."""

from __future__ import annotations

import math
from pathlib import Path
from typing import Any

from .schema import ExtractedFrame, Landmark, VideoExtraction


class MediaPipeExtractionError(RuntimeError):
    """Raised when a source video cannot be decoded or analyzed."""


def _landmarks(value: Any) -> list[Landmark]:
    if value is None:
        return []
    serialized: list[Landmark] = []
    for item in value.landmark:
        landmark: Landmark = {}
        x, y, z = float(item.x), float(item.y), float(item.z)
        if math.isfinite(x):
            landmark["x"] = round(x, 6)
        if math.isfinite(y):
            landmark["y"] = round(y, 6)
        if math.isfinite(z):
            landmark["z"] = round(z, 6)
        visibility = getattr(item, "visibility", None)
        if visibility is not None and math.isfinite(float(visibility)):
            landmark["visibility"] = round(float(visibility), 6)
        serialized.append(landmark)
    return serialized


class MediaPipeHolisticExtractor:
    """Extract pose, both hands, and face from every decoded source frame."""

    name = "mediapipe-holistic"

    def extract(self, video_path: Path) -> VideoExtraction:
        try:
            import cv2
            import mediapipe as mp
        except ImportError as error:
            raise MediaPipeExtractionError(
                "Install tools/requirements-animation.txt before converting clips."
            ) from error

        capture = cv2.VideoCapture(str(video_path))
        if not capture.isOpened():
            raise MediaPipeExtractionError(
                f"Unable to decode source video: {video_path}"
            )
        fps = float(capture.get(cv2.CAP_PROP_FPS))
        if not fps or fps <= 0:
            capture.release()
            raise MediaPipeExtractionError(
                f"Source video has invalid timing: {video_path}"
            )
        width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
        source_frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
        frames: list[ExtractedFrame] = []
        frame_index = 0
        holistic = mp.solutions.holistic.Holistic(
            static_image_mode=False,
            model_complexity=1,
            smooth_landmarks=True,
            refine_face_landmarks=True,
            min_detection_confidence=0.45,
            min_tracking_confidence=0.45,
        )
        try:
            while True:
                read, image = capture.read()
                if not read:
                    break
                timestamp_ms = round(frame_index * 1_000 / fps)
                result = holistic.process(cv2.cvtColor(image, cv2.COLOR_BGR2RGB))
                frames.append(
                    ExtractedFrame(
                        timestamp_ms=timestamp_ms,
                        pose=_landmarks(result.pose_landmarks),
                        face=_landmarks(result.face_landmarks),
                        left_hand=_landmarks(result.left_hand_landmarks),
                        right_hand=_landmarks(result.right_hand_landmarks),
                    )
                )
                frame_index += 1
        finally:
            holistic.close()
            capture.release()
        if not frames:
            raise MediaPipeExtractionError(
                f"Source video contains no decodable frames: {video_path}"
            )
        source_frame_count = max(source_frame_count, len(frames))
        duration_ms = max(
            round(source_frame_count * 1_000 / fps),
            frames[-1].timestamp_ms + round(1_000 / fps),
        )
        return VideoExtraction(
            width=width,
            height=height,
            fps=fps,
            duration_ms=duration_ms,
            source_frame_count=source_frame_count,
            frames=frames,
            extractor_name=self.name,
            extractor_version=mp.__version__,
        )
