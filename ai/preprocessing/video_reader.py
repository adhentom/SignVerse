"""Safe OpenCV video decoding and metadata extraction."""

from __future__ import annotations

import importlib
from dataclasses import dataclass
from pathlib import Path
from types import ModuleType
from typing import Any, Iterator

import numpy as np
from numpy.typing import NDArray


SUPPORTED_VIDEO_EXTENSIONS = frozenset({".avi", ".mov", ".mp4"})


class VideoReadError(RuntimeError):
    """Raised when a video cannot be opened or decoded."""


@dataclass(frozen=True, slots=True)
class VideoMetadata:
    """Container metadata reported by OpenCV."""

    path: Path
    fps: float
    duration: float
    width: int
    height: int
    total_frames: int


class VideoReader:
    """Context-managed OpenCV reader for MP4, AVI, and MOV videos."""

    def __init__(self, path: str | Path) -> None:
        """Open a supported video and read its container metadata."""
        self.path = Path(path).expanduser().resolve()
        if self.path.suffix.casefold() not in SUPPORTED_VIDEO_EXTENSIONS:
            supported = ", ".join(sorted(SUPPORTED_VIDEO_EXTENSIONS))
            raise VideoReadError(
                f"Unsupported video format '{self.path.suffix}' for {self.path}. "
                f"Supported formats: {supported}."
            )
        if not self.path.is_file():
            raise VideoReadError(f"Video does not exist: {self.path}")

        self._cv2 = self._load_cv2()
        self._capture: Any = self._cv2.VideoCapture(str(self.path))
        if not self._capture.isOpened():
            self._capture.release()
            raise VideoReadError(f"OpenCV could not open video: {self.path}")
        try:
            self.metadata = self._read_metadata()
        except Exception:
            self._capture.release()
            raise

    def __enter__(self) -> VideoReader:
        """Return this open reader."""
        return self

    def __exit__(self, *_args: object) -> None:
        """Release the OpenCV capture."""
        self.close()

    def frames(self) -> Iterator[tuple[int, NDArray[np.uint8]]]:
        """Yield decoded BGR frames with zero-based indices.

        A video that opens but yields no frames is treated as corrupted.
        """
        decoded = 0
        while True:
            success, frame = self._capture.read()
            if not success:
                break
            if frame is None or not isinstance(frame, np.ndarray) or frame.size == 0:
                raise VideoReadError(
                    f"OpenCV returned an invalid frame at index {decoded}: {self.path}"
                )
            yield decoded, frame
            decoded += 1
        if decoded == 0:
            raise VideoReadError(f"Video contains no decodable frames: {self.path}")

    def close(self) -> None:
        """Release the underlying OpenCV resource."""
        self._capture.release()

    def _read_metadata(self) -> VideoMetadata:
        fps = float(self._capture.get(self._cv2.CAP_PROP_FPS))
        width = int(self._capture.get(self._cv2.CAP_PROP_FRAME_WIDTH))
        height = int(self._capture.get(self._cv2.CAP_PROP_FRAME_HEIGHT))
        total_frames = int(self._capture.get(self._cv2.CAP_PROP_FRAME_COUNT))
        if not np.isfinite(fps) or fps <= 0:
            raise VideoReadError(f"Video reports an invalid FPS value: {self.path}")
        if width <= 0 or height <= 0:
            raise VideoReadError(f"Video reports invalid dimensions: {self.path}")
        if total_frames < 0:
            total_frames = 0
        duration = total_frames / fps if total_frames else 0.0
        return VideoMetadata(
            path=self.path,
            fps=fps,
            duration=duration,
            width=width,
            height=height,
            total_frames=total_frames,
        )

    @staticmethod
    def _load_cv2() -> ModuleType:
        try:
            return importlib.import_module("cv2")
        except ImportError as error:
            raise VideoReadError(
                "OpenCV is required for preprocessing. Install "
                "tools/requirements-animation.txt."
            ) from error
