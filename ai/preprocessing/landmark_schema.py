"""Stable numeric schema for SignVerse landmark sequences."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, Sequence

import numpy as np
from numpy.typing import NDArray


class Landmark(Protocol):
    """Coordinate fields shared by MediaPipe hand and pose landmarks."""

    @property
    def x(self) -> float:
        """Return the normalized horizontal coordinate."""

    @property
    def y(self) -> float:
        """Return the normalized vertical coordinate."""

    @property
    def z(self) -> float:
        """Return the relative depth coordinate."""


class PoseLandmark(Landmark, Protocol):
    """Pose coordinate fields, including MediaPipe visibility."""

    @property
    def visibility(self) -> float:
        """Return MediaPipe's landmark visibility confidence."""


@dataclass(frozen=True, slots=True)
class LandmarkSchema:
    """Describe the fixed frame-vector layout used by training data."""

    version: str = "1.0"
    hand_landmarks: int = 21
    hand_dimensions: int = 3
    pose_landmarks: int = 33
    pose_dimensions: int = 4

    @property
    def left_hand_offset(self) -> int:
        """Return the first index of the left-hand coordinates."""
        return 0

    @property
    def right_hand_offset(self) -> int:
        """Return the first index of the right-hand coordinates."""
        return self.hand_landmarks * self.hand_dimensions

    @property
    def pose_offset(self) -> int:
        """Return the first index of the pose coordinates."""
        return self.right_hand_offset + self.hand_landmarks * self.hand_dimensions

    @property
    def vector_size(self) -> int:
        """Return the fixed number of float32 values emitted per frame."""
        return self.pose_offset + self.pose_landmarks * self.pose_dimensions


DEFAULT_LANDMARK_SCHEMA = LandmarkSchema()


@dataclass(frozen=True, slots=True)
class FrameLandmarks:
    """Optional landmarks detected for one decoded video frame."""

    left_hand: Sequence[Landmark] | None = None
    right_hand: Sequence[Landmark] | None = None
    pose: Sequence[PoseLandmark] | None = None

    def to_vector(
        self,
        schema: LandmarkSchema = DEFAULT_LANDMARK_SCHEMA,
    ) -> NDArray[np.float32]:
        """Encode landmarks into a fixed vector, zero-filling missing groups."""
        vector = np.zeros(schema.vector_size, dtype=np.float32)
        self._write_hand(vector, schema.left_hand_offset, self.left_hand, schema)
        self._write_hand(vector, schema.right_hand_offset, self.right_hand, schema)
        self._write_pose(vector, schema.pose_offset, self.pose, schema)
        return vector

    @staticmethod
    def _write_hand(
        vector: NDArray[np.float32],
        offset: int,
        landmarks: Sequence[Landmark] | None,
        schema: LandmarkSchema,
    ) -> None:
        if landmarks is None:
            return
        if len(landmarks) != schema.hand_landmarks:
            raise ValueError(
                f"Expected {schema.hand_landmarks} hand landmarks, received {len(landmarks)}."
            )
        for index, landmark in enumerate(landmarks):
            start = offset + index * schema.hand_dimensions
            vector[start : start + schema.hand_dimensions] = (
                landmark.x,
                landmark.y,
                landmark.z,
            )

    @staticmethod
    def _write_pose(
        vector: NDArray[np.float32],
        offset: int,
        landmarks: Sequence[PoseLandmark] | None,
        schema: LandmarkSchema,
    ) -> None:
        if landmarks is None:
            return
        if len(landmarks) != schema.pose_landmarks:
            raise ValueError(
                f"Expected {schema.pose_landmarks} pose landmarks, received {len(landmarks)}."
            )
        for index, landmark in enumerate(landmarks):
            start = offset + index * schema.pose_dimensions
            vector[start : start + schema.pose_dimensions] = (
                landmark.x,
                landmark.y,
                landmark.z,
                landmark.visibility,
            )
