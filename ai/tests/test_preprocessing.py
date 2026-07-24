"""Unit tests for video-to-landmark preprocessing primitives."""

from __future__ import annotations

import json
import tempfile
import unittest
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator

import numpy as np
from numpy.typing import NDArray

from ai.datasets.schema import (
    CanonicalAnnotation,
    DatasetStatistics,
    NormalizedDatasetManifest,
    Resolution,
)
from ai.preprocessing.extract_landmarks import VideoJob, discover_jobs, process_video
from ai.preprocessing.landmark_schema import (
    DEFAULT_LANDMARK_SCHEMA,
    FrameLandmarks,
)
from ai.preprocessing.video_reader import VideoMetadata, VideoReadError, VideoReader
from src.dataset.adapters import INCLUDEDatasetAdapter


@dataclass(frozen=True)
class FakeHandLandmark:
    """Minimal hand landmark used by schema tests."""

    x: float
    y: float
    z: float


@dataclass(frozen=True)
class FakePoseLandmark(FakeHandLandmark):
    """Minimal pose landmark used by schema tests."""

    visibility: float


class FakePipeline:
    """Deterministic frame processor used by orchestration tests."""

    schema = DEFAULT_LANDMARK_SCHEMA

    def process(self, bgr_frame: NDArray[np.uint8]) -> NDArray[np.float32]:
        """Return a vector containing the frame's first value."""
        vector = np.zeros(self.schema.vector_size, dtype=np.float32)
        vector[0] = float(bgr_frame.flat[0])
        return vector


class FakeReader:
    """In-memory reader that mimics two decoded frames."""

    def __init__(self, path: Path) -> None:
        """Create deterministic metadata for the supplied source path."""
        self.metadata = VideoMetadata(path, 25.0, 0.08, 2, 2, 2)

    def __enter__(self) -> FakeReader:
        """Return this reader."""
        return self

    def __exit__(self, *_args: object) -> None:
        """Leave the reader context."""

    def frames(self) -> Iterator[tuple[int, NDArray[np.uint8]]]:
        """Yield two small frames."""
        yield 0, np.zeros((2, 2, 3), dtype=np.uint8)
        yield 1, np.ones((2, 2, 3), dtype=np.uint8)


class PreprocessingTests(unittest.TestCase):
    """Verify stable schema and resumable output behavior."""

    def test_landmark_schema_zero_fills_missing_groups(self) -> None:
        """Missing detections remain zero while supplied groups are encoded."""
        hands = [FakeHandLandmark(1.0, 2.0, 3.0)] * 21
        pose = [FakePoseLandmark(4.0, 5.0, 6.0, 0.75)] * 33

        vector = FrameLandmarks(left_hand=hands, pose=pose).to_vector()

        self.assertEqual(vector.shape, (258,))
        np.testing.assert_array_equal(
            vector[
                DEFAULT_LANDMARK_SCHEMA.right_hand_offset : DEFAULT_LANDMARK_SCHEMA.pose_offset
            ],
            np.zeros(63, dtype=np.float32),
        )
        self.assertEqual(vector[0], 1.0)
        self.assertEqual(vector[DEFAULT_LANDMARK_SCHEMA.pose_offset + 3], 0.75)

    def test_process_video_writes_npy_json_and_then_skips(self) -> None:
        """A completed current output is reused on the next batch run."""
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            source = root / "raw" / "hello.mp4"
            source.parent.mkdir()
            source.write_bytes(b"video")
            job = VideoJob(
                sample_id="000001",
                dataset="sample",
                label="hello",
                split="train",
                source=source,
                landmark_path=root / "output" / "hello.npy",
                metadata_path=root / "output" / "hello.json",
            )

            first = process_video(job, FakePipeline(), reader_factory=FakeReader)
            second = process_video(job, FakePipeline(), reader_factory=FakeReader)

            self.assertEqual(first.status, "processed")
            self.assertEqual(second.status, "skipped")
            sequence = np.load(job.landmark_path, allow_pickle=False)
            self.assertEqual(sequence.shape, (2, 258))
            metadata = json.loads(job.metadata_path.read_text(encoding="utf-8"))
            self.assertEqual(metadata["id"], "000001")
            self.assertEqual(metadata["dataset"], "sample")
            self.assertEqual(metadata["label"], "hello")
            self.assertEqual(metadata["split"], "train")
            self.assertEqual(metadata["fps"], 25.0)
            self.assertEqual(metadata["frames"], 2)
            self.assertEqual(metadata["duration"], 0.08)

    def test_discover_jobs_uses_normalized_manifest_and_canonical_ids(self) -> None:
        """Discovery reads normalized videos and writes flat canonical outputs."""
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            normalized = root / "normalized"
            videos = normalized / "videos"
            videos.mkdir(parents=True)
            for sample_id in ("000001", "000002"):
                (videos / f"{sample_id}.mp4").write_bytes(b"video")
            annotations = (
                CanonicalAnnotation(
                    id="000001",
                    video="videos/000001.mp4",
                    label="hello",
                    dataset="include",
                    split="train",
                    fps=25.0,
                    duration=1.0,
                    resolution=Resolution(320, 240),
                ),
                CanonicalAnnotation(
                    id="000002",
                    video="videos/000002.mp4",
                    label="friend",
                    dataset="isl-csltr",
                    split="validation",
                    fps=30.0,
                    duration=2.0,
                    resolution=Resolution(640, 480),
                ),
            )
            NormalizedDatasetManifest(
                annotations=annotations,
                statistics=DatasetStatistics.from_annotations(annotations),
            ).write(normalized / "annotations.json")

            output = root / "landmarks"
            jobs = discover_jobs(normalized, "isl-csltr", output)

            self.assertEqual(len(jobs), 1)
            job = jobs[0]
            self.assertEqual(job.sample_id, "000002")
            self.assertEqual(job.source, (videos / "000002.mp4").resolve())
            self.assertEqual(job.landmark_path, (output / "000002.npy").resolve())
            self.assertEqual(job.metadata_path, (output / "000002.json").resolve())
            self.assertEqual(job.label, "friend")
            self.assertEqual(job.dataset, "isl-csltr")
            self.assertEqual(job.split, "validation")

    def test_filesystem_adapter_discovers_only_supported_videos(self) -> None:
        """Dataset discovery accepts MP4, AVI, and MOV recursively."""
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            for relative in ("a.mp4", "nested/b.AVI", "nested/c.mov", "ignored.mkv"):
                path = root / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                path.touch()

            adapter = INCLUDEDatasetAdapter(root)

            self.assertTrue(adapter.validate())
            self.assertEqual(
                [path.suffix.casefold() for path in adapter.scan()],
                [".mp4", ".avi", ".mov"],
            )

    def test_video_reader_rejects_unsupported_format_before_opencv(self) -> None:
        """Unsupported containers produce a clear error without decoding."""
        with self.assertRaisesRegex(VideoReadError, "Unsupported video format"):
            VideoReader("sample.mkv")


if __name__ == "__main__":
    unittest.main()
