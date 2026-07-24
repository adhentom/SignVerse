"""MediaPipe Hands and Pose landmark extraction for decoded frames."""

from __future__ import annotations

import importlib
from dataclasses import dataclass
from types import ModuleType
from typing import Any

import numpy as np
from numpy.typing import NDArray

from .landmark_schema import DEFAULT_LANDMARK_SCHEMA, FrameLandmarks, LandmarkSchema


class MediaPipePipelineError(RuntimeError):
    """Raised when MediaPipe cannot initialize or process a frame."""


@dataclass(frozen=True, slots=True)
class MediaPipeConfig:
    """Runtime options for Hands/Pose or optional Holistic extraction."""

    use_holistic: bool = False
    input_is_mirrored: bool = False
    model_complexity: int = 1
    min_detection_confidence: float = 0.5
    min_tracking_confidence: float = 0.5

    def __post_init__(self) -> None:
        """Validate confidence thresholds and model settings."""
        if self.model_complexity not in {0, 1, 2}:
            raise ValueError("model_complexity must be 0, 1, or 2.")
        for name, value in (
            ("min_detection_confidence", self.min_detection_confidence),
            ("min_tracking_confidence", self.min_tracking_confidence),
        ):
            if not 0.0 <= value <= 1.0:
                raise ValueError(f"{name} must be between 0 and 1.")


class MediaPipeLandmarkPipeline:
    """Convert BGR video frames into fixed float32 landmark vectors."""

    def __init__(
        self,
        config: MediaPipeConfig | None = None,
        schema: LandmarkSchema = DEFAULT_LANDMARK_SCHEMA,
    ) -> None:
        """Initialize MediaPipe tracking graphs for sequential video frames."""
        self.config = config or MediaPipeConfig()
        self.schema = schema
        self._cv2 = self._import_required("cv2")
        self._mediapipe = self._import_required("mediapipe")
        self._hands: Any | None = None
        self._pose: Any | None = None
        self._holistic: Any | None = None
        self._initialize_models()

    def __enter__(self) -> MediaPipeLandmarkPipeline:
        """Return the initialized pipeline."""
        return self

    def __exit__(self, *_args: object) -> None:
        """Close all initialized MediaPipe graphs."""
        self.close()

    def process(self, bgr_frame: NDArray[np.uint8]) -> NDArray[np.float32]:
        """Extract hands and pose from one BGR frame as a fixed vector."""
        if not isinstance(bgr_frame, np.ndarray) or bgr_frame.size == 0:
            raise MediaPipePipelineError("Cannot process an empty video frame.")
        try:
            rgb_frame = self._cv2.cvtColor(bgr_frame, self._cv2.COLOR_BGR2RGB)
            rgb_frame.flags.writeable = False
            landmarks = (
                self._process_holistic(rgb_frame)
                if self.config.use_holistic
                else self._process_separate(rgb_frame)
            )
            return landmarks.to_vector(self.schema)
        except MediaPipePipelineError:
            raise
        except Exception as error:
            raise MediaPipePipelineError(
                f"MediaPipe failed to process a frame: {error}"
            ) from error

    def close(self) -> None:
        """Release MediaPipe graph resources."""
        for model in (self._hands, self._pose, self._holistic):
            if model is not None:
                model.close()

    def _initialize_models(self) -> None:
        solutions = getattr(self._mediapipe, "solutions", None)
        if solutions is None:
            raise MediaPipePipelineError(
                "This pipeline requires MediaPipe Solutions. Install the pinned "
                "mediapipe==0.10.21 from tools/requirements-animation.txt."
            )
        common = {
            "static_image_mode": False,
            "model_complexity": self.config.model_complexity,
            "min_detection_confidence": self.config.min_detection_confidence,
            "min_tracking_confidence": self.config.min_tracking_confidence,
        }
        if self.config.use_holistic:
            self._holistic = solutions.holistic.Holistic(
                refine_face_landmarks=False,
                **common,
            )
            return
        self._hands = solutions.hands.Hands(max_num_hands=2, **common)
        self._pose = solutions.pose.Pose(
            enable_segmentation=False,
            smooth_landmarks=True,
            **common,
        )

    def _process_holistic(self, rgb_frame: NDArray[np.uint8]) -> FrameLandmarks:
        if self._holistic is None:
            raise MediaPipePipelineError("Holistic model is not initialized.")
        result = self._holistic.process(rgb_frame)
        return FrameLandmarks(
            left_hand=self._landmark_list(result.left_hand_landmarks),
            right_hand=self._landmark_list(result.right_hand_landmarks),
            pose=self._landmark_list(result.pose_landmarks),
        )

    def _process_separate(self, rgb_frame: NDArray[np.uint8]) -> FrameLandmarks:
        if self._hands is None or self._pose is None:
            raise MediaPipePipelineError("Hands and Pose models are not initialized.")
        hand_result = self._hands.process(rgb_frame)
        pose_result = self._pose.process(rgb_frame)
        left_hand: Any | None = None
        right_hand: Any | None = None
        detected_hands = hand_result.multi_hand_landmarks or []
        handedness = hand_result.multi_handedness or []
        for landmarks, classification in zip(detected_hands, handedness, strict=False):
            label = classification.classification[0].label.casefold()
            if not self.config.input_is_mirrored:
                label = "right" if label == "left" else "left"
            if label == "left":
                left_hand = landmarks.landmark
            elif label == "right":
                right_hand = landmarks.landmark
        return FrameLandmarks(
            left_hand=left_hand,
            right_hand=right_hand,
            pose=self._landmark_list(pose_result.pose_landmarks),
        )

    @staticmethod
    def _landmark_list(container: Any | None) -> Any | None:
        return None if container is None else container.landmark

    @staticmethod
    def _import_required(name: str) -> ModuleType:
        try:
            return importlib.import_module(name)
        except ImportError as error:
            raise MediaPipePipelineError(
                f"Missing preprocessing dependency '{name}'. Install "
                "tools/requirements-animation.txt."
            ) from error
