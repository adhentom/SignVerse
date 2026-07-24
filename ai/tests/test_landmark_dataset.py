"""Unit tests for the PyTorch landmark dataset layer."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import DataLoader

from ai.datasets.schema import (
    CanonicalAnnotation,
    DatasetStatistics,
    NormalizedDatasetManifest,
    Resolution,
)
from ai.training.collate import LandmarkCollator, collate_landmark_batch
from ai.training.dataset import LandmarkDataset, LandmarkDatasetError
from ai.training.label_encoder import LabelEncoder, LabelEncoderError
from ai.training.splits import create_dataset_splits
from ai.training.statistics import generate_statistics, save_statistics


class LandmarkDatasetTests(unittest.TestCase):
    """Verify indexing, batching, splits, encoding, and quality reports."""

    def setUp(self) -> None:
        """Create a normalized manifest and four landmark samples."""
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary_directory.name)
        self.normalized = self.root / "normalized"
        self.landmarks = self.root / "landmarks"
        (self.normalized / "videos").mkdir(parents=True)
        self.landmarks.mkdir()
        specifications = (
            ("000001", "hello", "include", "train", 3, "ISL"),
            ("000002", "thanks", "include", "validation", 5, "ISL"),
            ("000003", "hello", "cislr", "test", 2, "ISL"),
            ("000004", "welcome", "cislr", "train", 4, "ASL"),
        )
        annotations: list[CanonicalAnnotation] = []
        for sample_id, label, dataset, split, frames, language in specifications:
            video = self.normalized / "videos" / f"{sample_id}.mp4"
            video.touch()
            annotations.append(
                CanonicalAnnotation(
                    id=sample_id,
                    video=f"videos/{sample_id}.mp4",
                    label=label,
                    dataset=dataset,
                    split=split,  # type: ignore[arg-type]
                    fps=25.0,
                    duration=frames / 25.0,
                    resolution=Resolution(640, 480),
                )
            )
            sequence = np.ones((frames, 258), dtype=np.float32)
            if sample_id == "000001":
                sequence[0, :63] = 0
            np.save(self.landmarks / f"sample_{sample_id}.npy", sequence)
            (self.landmarks / f"sample_{sample_id}.json").write_text(
                json.dumps(
                    {
                        "dataset": dataset,
                        "label": label,
                        "language": language,
                        "frames": frames,
                    }
                ),
                encoding="utf-8",
            )
        manifest = NormalizedDatasetManifest(
            tuple(annotations), DatasetStatistics.from_annotations(annotations)
        )
        manifest.write(self.normalized / "annotations.json")

    def tearDown(self) -> None:
        """Remove test files."""
        self.temporary_directory.cleanup()

    def test_label_encoder_round_trip_and_json_persistence(self) -> None:
        """Labels receive deterministic IDs that survive JSON save/load."""
        encoder = LabelEncoder.fit(["thanks", "hello", "hello"])
        mapping_path = self.root / "labels.json"

        encoder.save(mapping_path)
        loaded = LabelEncoder.load(mapping_path)

        self.assertEqual(encoder.labels, ("hello", "thanks"))
        self.assertEqual(loaded.encode("thanks"), 1)
        self.assertEqual(loaded.decode(0), "hello")
        with self.assertRaisesRegex(LabelEncoderError, "Unknown label"):
            loaded.encode("missing")

    def test_dataset_loads_tensors_and_filters_case_insensitively(self) -> None:
        """Manifest fields and optional metadata language drive filtering."""
        dataset = LandmarkDataset(
            self.normalized,
            self.landmarks,
            datasets="INCLUDE",
            languages="isl",
            splits={"train"},
        )

        item = dataset[0]

        self.assertEqual(len(dataset), 1)
        self.assertEqual(item.sample_id, "000001")
        self.assertEqual(item.landmarks.shape, (3, 258))
        self.assertEqual(item.landmarks.dtype, torch.float32)
        self.assertEqual(item.label, "hello")
        self.assertEqual(item.language, "ISL")

    def test_dataset_rejects_incomplete_inputs_in_strict_mode(self) -> None:
        """Missing arrays are reported clearly before training starts."""
        (self.landmarks / "sample_000004.npy").unlink()

        with self.assertRaisesRegex(LandmarkDatasetError, "Missing arrays: 000004"):
            LandmarkDataset(self.normalized, self.landmarks)

    def test_collate_pads_truncates_and_preserves_original_lengths(self) -> None:
        """Batches expose padding masks plus original and effective lengths."""
        dataset = LandmarkDataset(self.normalized, self.landmarks)
        batch = collate_landmark_batch([dataset[0], dataset[1]], max_length=4)

        self.assertEqual(batch["landmarks"].shape, (2, 4, 258))
        self.assertEqual(batch["lengths"].tolist(), [3, 5])
        self.assertEqual(batch["effective_lengths"].tolist(), [3, 4])
        self.assertEqual(
            batch["attention_mask"].tolist(),
            [[True, True, True, False], [True, True, True, True]],
        )
        left_batch = LandmarkCollator(max_length=2, truncation="left")([dataset[0]])
        torch.testing.assert_close(
            left_batch["landmarks"][0], dataset[0].landmarks[-2:]
        )
        loader_batch = next(
            iter(DataLoader(dataset, batch_size=2, collate_fn=LandmarkCollator()))
        )
        self.assertEqual(loader_batch["landmarks"].shape, (2, 5, 258))

    def test_statistics_report_distribution_and_missing_landmarks(self) -> None:
        """Statistics cover class balance, lengths, and zero-filled hand frames."""
        (self.landmarks / "sample_000004.npy").unlink()
        with self.assertLogs("signverse.training.dataset", level="WARNING"):
            dataset = LandmarkDataset(self.normalized, self.landmarks, strict=False)

        statistics = generate_statistics(dataset)
        output = self.root / "statistics.json"
        save_statistics(statistics, output)

        self.assertEqual(statistics.samples_per_class, {"hello": 2, "thanks": 1})
        self.assertEqual(statistics.sequence_length_histogram, {2: 1, 3: 1, 5: 1})
        self.assertAlmostEqual(statistics.average_sequence_length, 10 / 3, places=6)
        self.assertEqual(statistics.class_imbalance.imbalance_ratio, 2.0)
        self.assertEqual(statistics.missing_landmarks.missing_files, ("000004",))
        self.assertEqual(statistics.missing_landmarks.left_hand_missing_frames, 1)
        self.assertTrue(output.is_file())

    def test_permissive_audit_supports_a_fully_missing_landmark_directory(self) -> None:
        """Quality reporting remains available before preprocessing completes."""
        for landmark_path in self.landmarks.glob("*.npy"):
            landmark_path.unlink()

        with self.assertLogs("signverse.training.dataset", level="WARNING"):
            dataset = LandmarkDataset(self.normalized, self.landmarks, strict=False)
        statistics = generate_statistics(dataset)

        self.assertEqual(len(dataset), 0)
        self.assertEqual(len(dataset.label_encoder), 3)
        self.assertEqual(statistics.average_sequence_length, 0.0)
        self.assertEqual(
            statistics.missing_landmarks.missing_files,
            ("000001", "000002", "000003", "000004"),
        )

    def test_split_views_share_one_label_vocabulary(self) -> None:
        """Manifest splits become PyTorch subsets without remapping labels."""
        splits = create_dataset_splits(self.normalized, self.landmarks)

        self.assertEqual(
            (len(splits.train), len(splits.validation), len(splits.test)), (2, 1, 1)
        )
        self.assertEqual(splits.label_encoder.labels, ("hello", "thanks", "welcome"))


if __name__ == "__main__":
    unittest.main()
