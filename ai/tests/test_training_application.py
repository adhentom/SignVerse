"""End-to-end tests for the SignVerse training and evaluation applications."""

from __future__ import annotations

import csv
import json
import tempfile
import unittest
from pathlib import Path

import numpy as np
import torch

from ai.datasets.schema import (
    CanonicalAnnotation,
    DatasetStatistics,
    NormalizedDatasetManifest,
    Resolution,
)
from ai.evaluate import classification_report, main as evaluate_main
from ai.models import BiLSTMClassifier, BiLSTMConfig
from ai.train import (
    OptimizerSettings,
    SchedulerSettings,
    TrainingApplicationError,
    create_optimizer,
    create_scheduler,
    load_training_config,
    main as train_main,
    run_training,
)


class TrainingApplicationTests(unittest.TestCase):
    """Verify configuration, factories, CLI training, evaluation, and reports."""

    def setUp(self) -> None:
        """Create a small normalized three-class landmark corpus and config."""
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary_directory.name)
        self.normalized = self.root / "normalized"
        self.landmarks = self.root / "landmarks"
        self.output = self.root / "artifacts"
        (self.normalized / "videos").mkdir(parents=True)
        self.landmarks.mkdir()
        annotations: list[CanonicalAnnotation] = []
        sample_index = 1
        for label_index, label in enumerate(("hello", "thanks", "welcome")):
            for split in ("train", "validation", "test"):
                sample_id = f"{sample_index:06d}"
                frames = 2 + label_index
                (self.normalized / "videos" / f"{sample_id}.mp4").touch()
                annotations.append(
                    CanonicalAnnotation(
                        id=sample_id,
                        video=f"videos/{sample_id}.mp4",
                        label=label,
                        dataset="synthetic",
                        split=split,
                        fps=25.0,
                        duration=frames / 25.0,
                        resolution=Resolution(64, 48),
                    )
                )
                sequence = np.zeros((frames, 258), dtype=np.float32)
                sequence[:, label_index] = 1.0
                np.save(self.landmarks / f"sample_{sample_id}.npy", sequence)
                (self.landmarks / f"sample_{sample_id}.json").write_text(
                    json.dumps(
                        {
                            "dataset": "synthetic",
                            "label": label,
                            "language": "ISL",
                            "frames": frames,
                        }
                    ),
                    encoding="utf-8",
                )
                sample_index += 1
        manifest = NormalizedDatasetManifest(
            tuple(annotations), DatasetStatistics.from_annotations(annotations)
        )
        manifest.write(self.normalized / "annotations.json")
        self.config_path = self.root / "bilstm.yaml"
        self.config_path.write_text(
            json.dumps(
                {
                    "paths": {
                        "normalized_root": str(self.normalized),
                        "landmarks_root": str(self.landmarks),
                        "output_dir": str(self.output),
                    },
                    "dataset": {
                        "datasets": ["synthetic"],
                        "languages": ["ISL"],
                        "expected_features": 258,
                        "strict": True,
                    },
                    "loader": {
                        "batch_size": 3,
                        "num_workers": 0,
                        "max_length": 4,
                        "padding_value": 0.0,
                        "truncation": "right",
                        "pin_memory": False,
                    },
                    "model": {
                        "model_type": "bilstm",
                        "projection_size": 6,
                        "hidden_size": 4,
                        "num_layers": 1,
                        "dropout": 0.0,
                        "bidirectional": True,
                        "pooling": "mean",
                    },
                    "optimizer": {
                        "name": "adam",
                        "learning_rate": 0.01,
                        "weight_decay": 0.0,
                        "momentum": 0.0,
                    },
                    "scheduler": {"name": "none"},
                    "training": {
                        "epochs": 1,
                        "device": "cpu",
                        "mixed_precision": False,
                        "gradient_clip_norm": 1.0,
                        "gradient_accumulation_steps": 1,
                        "scheduler_interval": "epoch",
                        "monitor": "validation_loss",
                        "monitor_mode": "min",
                        "seed": 5,
                        "deterministic": True,
                        "early_stopping": False,
                        "early_stopping_patience": 2,
                        "early_stopping_min_delta": 0.0,
                    },
                    "loss": {"label_smoothing": 0.0, "class_weights": None},
                }
            ),
            encoding="utf-8",
        )

    def tearDown(self) -> None:
        """Remove all generated data and reports."""
        self.temporary_directory.cleanup()

    def test_training_and_evaluation_clis_generate_every_artifact(self) -> None:
        """Real CLI entry points train, reload, evaluate, and export all reports."""
        train_status = train_main(
            ["--config", str(self.config_path), "--log-level", "WARNING"]
        )
        checkpoint = self.output / "checkpoints" / "best.pt"
        with self.assertRaisesRegex(TrainingApplicationError, "already exists"):
            run_training(load_training_config(self.config_path))

        evaluate_status = evaluate_main(
            ["--checkpoint", str(checkpoint), "--log-level", "WARNING"]
        )

        self.assertEqual((train_status, evaluate_status), (0, 0))
        expected_files = (
            "training_history.json",
            "training_history.csv",
            "run_config.json",
            "loss.png",
            "accuracy.png",
            "metrics.json",
            "classification_report.csv",
            "confusion_matrix.csv",
            "confusion_matrix.png",
        )
        for filename in expected_files:
            with self.subTest(filename=filename):
                self.assertTrue((self.output / filename).is_file())
        self.assertTrue(checkpoint.is_file())
        self.assertTrue((self.output / "checkpoints" / "latest.pt").is_file())

        metrics = json.loads((self.output / "metrics.json").read_text(encoding="utf-8"))
        self.assertIn("accuracy", metrics)
        self.assertIn("precision_macro", metrics)
        self.assertIn("recall_weighted", metrics)
        self.assertIn("f1_macro", metrics)
        self.assertIn("top1_accuracy", metrics)
        self.assertIn("top5_accuracy", metrics)
        self.assertEqual(
            set(metrics["per_class_accuracy"]), {"hello", "thanks", "welcome"}
        )
        with (self.output / "classification_report.csv").open(
            encoding="utf-8", newline=""
        ) as source:
            rows = list(csv.DictReader(source))
        self.assertEqual(len(rows), 3)
        self.assertEqual(
            set(rows[0]),
            {"label", "precision", "recall", "f1_score", "support", "accuracy"},
        )
        for image in ("loss.png", "accuracy.png", "confusion_matrix.png"):
            self.assertEqual(
                (self.output / image).read_bytes()[:8], b"\x89PNG\r\n\x1a\n"
            )

        run_config = json.loads(
            (self.output / "run_config.json").read_text(encoding="utf-8")
        )
        self.assertTrue(Path(run_config["paths"]["normalized_root"]).is_absolute())

    def test_classification_report_calculates_per_class_accuracy(self) -> None:
        """Per-class CSV values derive directly from confusion counts."""
        confusion = np.asarray([[3, 1], [2, 4]], dtype=np.int64)

        rows = classification_report(confusion, ("first", "second"))

        self.assertEqual(rows[0].support, 4)
        self.assertAlmostEqual(rows[0].precision, 3 / 5)
        self.assertAlmostEqual(rows[0].accuracy, 3 / 4)
        self.assertAlmostEqual(rows[1].recall, 4 / 6)

    def test_optimizer_and_scheduler_factories_cover_supported_options(self) -> None:
        """Every configured optimizer and scheduler creates a PyTorch object."""
        for optimizer_name in ("adam", "adamw", "sgd"):
            with self.subTest(optimizer=optimizer_name):
                model = BiLSTMClassifier(
                    BiLSTMConfig(
                        num_classes=3,
                        projection_size=4,
                        hidden_size=3,
                        num_layers=1,
                        dropout=0.0,
                    )
                )
                optimizer = create_optimizer(
                    model,
                    OptimizerSettings(
                        name=optimizer_name,
                        learning_rate=0.01,
                    ),
                )
                self.assertIsInstance(optimizer, torch.optim.Optimizer)

        model = BiLSTMClassifier(
            BiLSTMConfig(
                num_classes=3,
                projection_size=4,
                hidden_size=3,
                num_layers=1,
                dropout=0.0,
            )
        )
        for scheduler_name in ("none", "step", "cosine", "plateau"):
            with self.subTest(scheduler=scheduler_name):
                optimizer = torch.optim.SGD(model.parameters(), lr=0.01)
                scheduler = create_scheduler(
                    optimizer,
                    SchedulerSettings(name=scheduler_name),
                )
                if scheduler_name == "none":
                    self.assertIsNone(scheduler)
                else:
                    self.assertIsNotNone(scheduler)

    def test_configuration_loading_supports_documented_path_and_clear_errors(
        self,
    ) -> None:
        """The documented config path resolves to the bundled default configuration."""
        bundled = load_training_config("configs/bilstm.yaml")
        loaded = load_training_config(self.config_path)
        self.assertEqual(bundled.model.model_type, "bilstm")
        self.assertEqual(loaded.training.epochs, 1)
        with self.assertRaisesRegex(TrainingApplicationError, "does not exist"):
            load_training_config(self.root / "missing.yaml")
        invalid = self.root / "invalid.yaml"
        invalid.write_text('{"model": {"hidden_sze": 10}}', encoding="utf-8")
        with self.assertRaisesRegex(TrainingApplicationError, "hidden_sze"):
            load_training_config(invalid)


if __name__ == "__main__":
    unittest.main()
