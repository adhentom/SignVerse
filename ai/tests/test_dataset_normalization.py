"""Unit tests for canonical ISL dataset normalization."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from ai.datasets.normalize import (
    DatasetNormalizationError,
    NormalizationConfig,
    normalize_datasets,
)
from ai.datasets.schema import DatasetSchemaError, load_manifest
from ai.preprocessing.video_reader import VideoMetadata
from src.dataset import DatasetManager
from src.dataset.adapters import CISLRDatasetAdapter, INCLUDEDatasetAdapter


def fake_probe(path: Path) -> VideoMetadata:
    """Return deterministic metadata for a test video."""
    return VideoMetadata(path, 25.0, 2.0, 640, 480, 50)


class DatasetNormalizationTests(unittest.TestCase):
    """Verify normalized layout, splits, statistics, and validation."""

    def test_normalizes_videos_annotations_splits_and_statistics(self) -> None:
        """One adapter is converted into the complete canonical layout."""
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            source_root = root / "raw"
            for index in range(4):
                video = source_root / "Hello" / f"signer-{index}.mp4"
                video.parent.mkdir(parents=True, exist_ok=True)
                video.write_bytes(f"video-{index}".encode())
            manager = DatasetManager()
            manager.register_dataset("include", source_root, INCLUDEDatasetAdapter)
            output = root / "normalized"

            manifest = normalize_datasets(
                manager,
                ["include"],
                NormalizationConfig(
                    output_root=output,
                    copy_mode="copy",
                    show_progress=False,
                ),
                video_probe=fake_probe,
            )

            self.assertEqual(len(manifest.annotations), 4)
            self.assertEqual(
                [annotation.id for annotation in manifest.annotations],
                ["000001", "000002", "000003", "000004"],
            )
            self.assertEqual(
                {annotation.split for annotation in manifest.annotations},
                {"train", "validation", "test"},
            )
            self.assertTrue((output / "videos" / "000001.mp4").is_file())
            self.assertTrue((output / "annotations.json").is_file())
            self.assertTrue((output / "statistics.json").is_file())
            self.assertEqual(manifest.statistics.duplicate_labels, {"hello": 4})
            self.assertEqual(manifest.statistics.by_split["validation"], 1)
            self.assertEqual(manifest.statistics.by_split["test"], 1)
            reloaded = load_manifest(output / "annotations.json")
            self.assertEqual(reloaded, manifest)

    def test_preserves_recognized_source_split(self) -> None:
        """A train/validation/test directory takes precedence over generation."""
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            source_root = root / "raw"
            for split in ("train", "validation", "test"):
                video = source_root / split / "Thanks" / f"{split}.mp4"
                video.parent.mkdir(parents=True, exist_ok=True)
                video.write_bytes(split.encode())
            manager = DatasetManager()
            manager.register_dataset("include", source_root, INCLUDEDatasetAdapter)

            manifest = normalize_datasets(
                manager,
                ["include"],
                NormalizationConfig(
                    output_root=root / "normalized",
                    copy_mode="copy",
                    show_progress=False,
                ),
                video_probe=fake_probe,
            )

            split_by_source_content = {
                (root / annotation.video).name: annotation.split
                for annotation in manifest.annotations
            }
            self.assertEqual(
                {annotation.split for annotation in manifest.annotations},
                {"train", "validation", "test"},
            )
            self.assertEqual(len(split_by_source_content), 3)

    def test_cislr_adapter_uses_csv_label_and_test_membership(self) -> None:
        """CSV annotations override an uninformative video directory name."""
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            source_root = root / "raw"
            video = source_root / "CISLR_videos" / "opaque-id.mp4"
            video.parent.mkdir(parents=True)
            video.write_bytes(b"video")
            (source_root / "dataset.csv").write_text(
                "video_id,label\nopaque-id,Good Morning\n", encoding="utf-8"
            )
            (source_root / "test.csv").write_text(
                "video_id,label\nopaque-id,Good Morning\n", encoding="utf-8"
            )
            manager = DatasetManager()
            manager.register_dataset("cislr", source_root, CISLRDatasetAdapter)

            manifest = normalize_datasets(
                manager,
                ["cislr"],
                NormalizationConfig(
                    output_root=root / "normalized",
                    copy_mode="copy",
                    show_progress=False,
                ),
                video_probe=fake_probe,
            )

            self.assertEqual(manifest.annotations[0].label, "Good Morning")
            self.assertEqual(manifest.annotations[0].split, "test")

    def test_refuses_to_replace_existing_destination_without_overwrite(self) -> None:
        """Existing normalized data is protected unless overwrite is explicit."""
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            source_root = root / "raw"
            video = source_root / "Hello" / "sample.mp4"
            video.parent.mkdir(parents=True)
            video.write_bytes(b"video")
            output = root / "normalized"
            output.mkdir()
            marker = output / "keep.txt"
            marker.write_text("keep", encoding="utf-8")
            manager = DatasetManager()
            manager.register_dataset("include", source_root, INCLUDEDatasetAdapter)

            with self.assertRaisesRegex(DatasetNormalizationError, "already exists"):
                normalize_datasets(
                    manager,
                    ["include"],
                    NormalizationConfig(
                        output_root=output,
                        copy_mode="copy",
                        show_progress=False,
                    ),
                    video_probe=fake_probe,
                )

            self.assertEqual(marker.read_text(encoding="utf-8"), "keep")

    def test_manifest_rejects_missing_video(self) -> None:
        """Manifest loading validates every referenced normalized sample."""
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            manifest_path = root / "annotations.json"
            manifest_path.write_text(
                json.dumps(
                    {
                        "schema_version": "1.0",
                        "annotations": [
                            {
                                "id": "000001",
                                "video": "videos/000001.mp4",
                                "label": "hello",
                                "dataset": "include",
                                "split": "train",
                                "fps": 25,
                                "duration": 1,
                                "resolution": {"width": 640, "height": 480},
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )

            with self.assertRaisesRegex(DatasetSchemaError, "missing video"):
                load_manifest(manifest_path)


if __name__ == "__main__":
    unittest.main()
