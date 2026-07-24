"""Unit tests for the model-agnostic PyTorch training infrastructure."""

from __future__ import annotations

import csv
import json
import tempfile
import unittest
from pathlib import Path
from typing import TypedDict, cast

import torch
from torch import nn
from torch.utils.data import DataLoader, Dataset

from ai.training.callbacks import Callback, CallbackContext, EarlyStopping
from ai.training.checkpoint import CheckpointError
from ai.training.config import TrainerConfig
from ai.training.history import EpochRecord, TrainingHistory
from ai.training.label_encoder import LabelEncoder
from ai.training.losses import ClassificationLossConfig, create_classification_loss
from ai.training.metrics import (
    ClassificationMetricAccumulator,
    compute_classification_metrics,
)
from ai.training.trainer import Trainer
from ai.training.utils import resolve_device, seed_everything


class ToyItem(TypedDict):
    """One fixed-size test sample compatible with the trainer batch contract."""

    landmarks: torch.Tensor
    attention_mask: torch.Tensor
    lengths: torch.Tensor
    labels: torch.Tensor
    sample_ids: str


class ToyDataset(Dataset[ToyItem]):
    """Small deterministic three-class sequence dataset used only by tests."""

    def __init__(self) -> None:
        """Create four clear examples for each class."""
        self.items: list[ToyItem] = []
        for label in range(3):
            for sample_index in range(4):
                sequence = torch.zeros((3, 4), dtype=torch.float32)
                sequence[:, label] = 1.0
                sequence[:, 3] = sample_index / 100.0
                self.items.append(
                    {
                        "landmarks": sequence,
                        "attention_mask": torch.ones(3, dtype=torch.bool),
                        "lengths": torch.tensor(3, dtype=torch.long),
                        "labels": torch.tensor(label, dtype=torch.long),
                        "sample_ids": f"{label}-{sample_index}",
                    }
                )

    def __len__(self) -> int:
        """Return the sample count."""
        return len(self.items)

    def __getitem__(self, index: int) -> ToyItem:
        """Return one deterministic sample."""
        return self.items[index]


class TinyTestClassifier(nn.Module):
    """Minimal test-only classifier; no production architecture is introduced."""

    def __init__(self) -> None:
        """Create a single linear classification layer."""
        super().__init__()
        self.classifier = nn.Linear(4, 3)

    def forward(
        self, landmarks: torch.Tensor, attention_mask: torch.Tensor | None = None
    ) -> torch.Tensor:
        """Mean-pool valid frames and return three class logits."""
        if attention_mask is None:
            pooled = landmarks.mean(dim=1)
        else:
            weights = attention_mask.unsqueeze(-1).to(landmarks.dtype)
            pooled = (landmarks * weights).sum(dim=1) / weights.sum(dim=1)
        return cast(torch.Tensor, self.classifier(pooled))


class RecordingCallback(Callback):
    """Record lifecycle hook calls for trainer integration tests."""

    def __init__(self) -> None:
        """Initialize empty hook counters."""
        self.started = 0
        self.epochs: list[int] = []
        self.ended = 0

    def on_train_start(self, context: CallbackContext) -> None:
        """Count training starts."""
        self.started += 1

    def on_epoch_end(self, context: CallbackContext) -> None:
        """Record completed epoch numbers."""
        self.epochs.append(context.epoch)

    def on_train_end(self, context: CallbackContext) -> None:
        """Count training completions."""
        self.ended += 1


class TrainingInfrastructureTests(unittest.TestCase):
    """Verify losses, metrics, history, callbacks, checkpoints, and Trainer APIs."""

    def setUp(self) -> None:
        """Create temporary artifacts, loaders, and a stable vocabulary."""
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary_directory.name)
        self.loader = DataLoader(ToyDataset(), batch_size=4, shuffle=False)
        self.labels = LabelEncoder(("zero", "one", "two"))

    def tearDown(self) -> None:
        """Remove temporary artifacts."""
        self.temporary_directory.cleanup()

    def test_cross_entropy_supports_smoothing_and_class_weights(self) -> None:
        """Loss configuration produces weighted differentiable cross entropy."""
        criterion = create_classification_loss(
            ClassificationLossConfig(
                label_smoothing=0.1,
                class_weights=(1.0, 2.0, 3.0),
            )
        )
        logits = torch.tensor([[3.0, 1.0, 0.0], [0.0, 1.0, 3.0]], requires_grad=True)

        loss = criterion(logits, torch.tensor([0, 2]))
        loss.backward()

        self.assertGreater(float(loss.item()), 0.0)
        self.assertIsNotNone(logits.grad)

    def test_metrics_include_macro_weighted_topk_and_confusion_matrix(self) -> None:
        """Metrics match a known three-class confusion pattern."""
        logits = torch.tensor([[5.0, 0.0, 0.0], [0.0, 0.0, 5.0], [0.0, 0.0, 5.0]])
        targets = torch.tensor([0, 1, 2])

        metrics = compute_classification_metrics(logits, targets)

        self.assertAlmostEqual(metrics.accuracy, 2 / 3)
        self.assertAlmostEqual(metrics.precision_macro, 0.5)
        self.assertAlmostEqual(metrics.recall_macro, 2 / 3)
        self.assertAlmostEqual(metrics.f1_macro, 5 / 9)
        self.assertIsNone(metrics.top5_accuracy)
        self.assertEqual(metrics.confusion_matrix, [[1, 0, 0], [0, 0, 1], [0, 0, 1]])

        top5 = ClassificationMetricAccumulator(5)
        top5.update(torch.eye(5), torch.arange(5))
        self.assertEqual(top5.compute().top5_accuracy, 1.0)

    def test_history_exports_json_and_csv(self) -> None:
        """History exports contain losses, rates, durations, and flattened metrics."""
        history = TrainingHistory()
        history.append(
            EpochRecord(
                epoch=1,
                train_loss=1.2,
                validation_loss=1.0,
                learning_rate=0.01,
                duration_seconds=2.5,
                train_metrics={"accuracy": 0.5},
                validation_metrics={"confusion_matrix": [[1, 0], [0, 1]]},
            )
        )
        json_path = self.root / "history.json"
        csv_path = self.root / "history.csv"

        history.save_json(json_path)
        history.save_csv(csv_path)

        loaded = TrainingHistory.from_dict(
            json.loads(json_path.read_text(encoding="utf-8"))
        )
        with csv_path.open(encoding="utf-8", newline="") as source:
            rows = list(csv.DictReader(source))
        self.assertEqual(len(loaded), 1)
        self.assertEqual(rows[0]["train_accuracy"], "0.5")
        self.assertEqual(rows[0]["validation_confusion_matrix"], "[[1,0],[0,1]]")

    def test_early_stopping_requests_stop_after_patience(self) -> None:
        """Early stopping reacts only after the configured non-improvement window."""
        callback = EarlyStopping(patience=1)
        context = CallbackContext(logs={"validation_loss": 1.0})
        callback.on_epoch_end(context)
        context.logs = {"validation_loss": 1.1}
        callback.on_epoch_end(context)
        self.assertFalse(context.should_stop)
        callback.on_epoch_end(context)
        self.assertTrue(context.should_stop)

    def test_trainer_train_validate_test_predict_checkpoint_and_resume(self) -> None:
        """The generic loop runs every public lifecycle and resumes complete state."""
        seed_everything(7)
        model = TinyTestClassifier()
        optimizer = torch.optim.SGD(model.parameters(), lr=0.2)
        scheduler = torch.optim.lr_scheduler.StepLR(optimizer, step_size=1, gamma=0.5)
        callback = RecordingCallback()
        config = TrainerConfig(
            epochs=2,
            device="cpu",
            gradient_clip_norm=1.0,
            gradient_accumulation_steps=2,
            checkpoint_dir=self.root / "checkpoints",
            seed=7,
        )
        trainer = Trainer(
            model,
            optimizer,
            self.labels,
            scheduler=scheduler,
            config=config,
            callbacks=[callback],
        )

        history = trainer.train(self.loader, self.loader)
        validation = trainer.validate(self.loader)
        test = trainer.test(self.loader)
        predictions = trainer.predict(self.loader)

        self.assertEqual(len(history), 2)
        self.assertEqual(callback.epochs, [1, 2])
        self.assertEqual((callback.started, callback.ended), (1, 1))
        self.assertEqual(validation.samples, 12)
        self.assertEqual(test.samples, 12)
        self.assertEqual(predictions.logits.shape, (12, 3))
        self.assertEqual(len(predictions.sample_ids), 12)
        self.assertTrue((self.root / "checkpoints" / "best.pt").is_file())
        self.assertTrue((self.root / "checkpoints" / "latest.pt").is_file())
        self.assertTrue((self.root / "checkpoints" / "history.json").is_file())
        self.assertTrue((self.root / "checkpoints" / "history.csv").is_file())
        self.assertTrue((self.root / "checkpoints" / "labels.json").is_file())
        checkpoint = torch.load(
            self.root / "checkpoints" / "latest.pt", weights_only=False
        )
        self.assertIn("optimizer_state_dict", checkpoint)
        self.assertIn("scheduler_state_dict", checkpoint)
        self.assertIn("history", checkpoint)
        self.assertEqual(
            checkpoint["label_vocabulary"]["labels"], ["zero", "one", "two"]
        )

        resumed_model = TinyTestClassifier()
        resumed_optimizer = torch.optim.SGD(resumed_model.parameters(), lr=0.2)
        resumed_scheduler = torch.optim.lr_scheduler.StepLR(
            resumed_optimizer, step_size=1, gamma=0.5
        )
        resumed = Trainer(
            resumed_model,
            resumed_optimizer,
            self.labels,
            scheduler=resumed_scheduler,
            config=TrainerConfig(
                epochs=3,
                device="cpu",
                checkpoint_dir=self.root / "checkpoints",
                seed=7,
            ),
        )
        resumed_history = resumed.train(
            self.loader,
            self.loader,
            resume_from=self.root / "checkpoints" / "latest.pt",
        )
        self.assertEqual(len(resumed_history), 3)
        self.assertEqual(resumed.completed_epoch, 3)

    def test_resume_rejects_a_different_label_vocabulary(self) -> None:
        """A checkpoint cannot silently change classification target IDs."""
        model = TinyTestClassifier()
        optimizer = torch.optim.SGD(model.parameters(), lr=0.1)
        config = TrainerConfig(
            epochs=1, device="cpu", checkpoint_dir=self.root / "checkpoints"
        )
        with self.assertLogs("signverse.training.trainer", level="WARNING"):
            Trainer(model, optimizer, self.labels, config=config).train(self.loader)

        other_model = TinyTestClassifier()
        other_optimizer = torch.optim.SGD(other_model.parameters(), lr=0.1)
        other_labels = LabelEncoder(("one", "zero", "two"))
        other = Trainer(other_model, other_optimizer, other_labels, config=config)

        with self.assertRaisesRegex(CheckpointError, "label vocabulary"):
            other.resume(self.root / "checkpoints" / "latest.pt")

    def test_device_resolution_rejects_unavailable_accelerators(self) -> None:
        """Explicit unavailable GPU requests fail instead of silently using CPU."""
        self.assertEqual(resolve_device("cpu"), torch.device("cpu"))
        if not torch.cuda.is_available():
            with self.assertRaisesRegex(RuntimeError, "CUDA"):
                resolve_device("cuda")


if __name__ == "__main__":
    unittest.main()
