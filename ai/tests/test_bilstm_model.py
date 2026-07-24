"""Comprehensive tests for the production BiLSTM baseline."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import torch

from ai.models import (
    BaseModel,
    BiLSTMClassifier,
    BiLSTMConfig,
    ModelFactory,
    ModelFactoryError,
    create_model,
)
from ai.training import LabelEncoder, Trainer, TrainerConfig


class BiLSTMModelTests(unittest.TestCase):
    """Verify architecture behavior, validation, factory, and Trainer compatibility."""

    def setUp(self) -> None:
        """Use deterministic model parameters and inputs."""
        torch.manual_seed(17)

    def test_forward_and_feature_extractor_shapes(self) -> None:
        """The model returns logits and pooled recurrent representations."""
        config = BiLSTMConfig(
            num_classes=7,
            projection_size=16,
            hidden_size=12,
            num_layers=2,
            dropout=0.1,
            bidirectional=True,
        )
        model = BiLSTMClassifier(config).eval()
        landmarks = torch.randn(3, 6, 258)
        lengths = torch.tensor([6, 4, 2])
        mask = torch.arange(6).unsqueeze(0) < lengths.unsqueeze(1)

        features = model.feature_extractor(
            landmarks, attention_mask=mask, effective_lengths=lengths
        )
        logits = model(landmarks, attention_mask=mask, effective_lengths=lengths)

        self.assertEqual(features.shape, (3, 24))
        self.assertEqual(logits.shape, (3, 7))
        self.assertTrue(torch.isfinite(logits).all())
        self.assertFalse(
            any(isinstance(module, torch.nn.Softmax) for module in model.modules())
        )

    def test_padding_values_do_not_change_packed_sequence_features(self) -> None:
        """Packed recurrent processing ignores arbitrary values in padded frames."""
        model = BiLSTMClassifier(
            BiLSTMConfig(
                num_classes=3,
                projection_size=10,
                hidden_size=8,
                dropout=0.0,
            )
        ).eval()
        valid = torch.randn(1, 3, 258)
        first = torch.cat((valid, torch.zeros(1, 2, 258)), dim=1)
        second = torch.cat((valid, torch.full((1, 2, 258), 1000.0)), dim=1)
        mask = torch.tensor([[True, True, True, False, False]])

        with torch.inference_mode():
            first_features = model.feature_extractor(first, attention_mask=mask)
            second_features = model.feature_extractor(second, attention_mask=mask)

        torch.testing.assert_close(first_features, second_features)

    def test_all_pooling_strategies_and_direction_modes(self) -> None:
        """Mean, max, and last pooling support uni- and bidirectional outputs."""
        landmarks = torch.randn(2, 4, 258)
        lengths = torch.tensor([4, 2])
        for pooling in ("mean", "max", "last"):
            for bidirectional in (False, True):
                with self.subTest(pooling=pooling, bidirectional=bidirectional):
                    config = BiLSTMConfig(
                        num_classes=4,
                        projection_size=8,
                        hidden_size=5,
                        num_layers=1,
                        dropout=0.0,
                        bidirectional=bidirectional,
                        pooling=pooling,
                    )
                    model = BiLSTMClassifier(config).eval()
                    features = model.feature_extractor(
                        landmarks, effective_lengths=lengths
                    )
                    self.assertEqual(
                        features.shape,
                        (2, 10 if bidirectional else 5),
                    )
                    self.assertEqual(
                        model(landmarks, effective_lengths=lengths).shape, (2, 4)
                    )

    def test_predict_returns_ids_and_restores_training_mode(self) -> None:
        """The model-level prediction helper does not leave the model in eval mode."""
        model = BiLSTMClassifier(
            BiLSTMConfig(
                num_classes=3,
                projection_size=8,
                hidden_size=6,
                dropout=0.0,
            )
        )
        model.train()

        predictions = model.predict(torch.randn(2, 3, 258))

        self.assertEqual(predictions.shape, (2,))
        self.assertEqual(predictions.dtype, torch.int64)
        self.assertTrue(model.training)

    def test_gradients_flow_through_projection_recurrent_and_head(self) -> None:
        """Raw logits remain differentiable for Trainer-owned loss computation."""
        model = BiLSTMClassifier(
            BiLSTMConfig(
                num_classes=3,
                projection_size=8,
                hidden_size=6,
                dropout=0.0,
            )
        )
        logits = model(torch.randn(2, 3, 258))

        loss = torch.nn.functional.cross_entropy(logits, torch.tensor([0, 2]))
        loss.backward()  # type: ignore[no-untyped-call]

        self.assertIsNotNone(model.input_projection.weight.grad)
        self.assertIsNotNone(model.recurrent.weight_ih_l0.grad)
        self.assertIsNotNone(model.classification_head.weight.grad)

    def test_invalid_shapes_lengths_and_masks_raise_clear_errors(self) -> None:
        """Malformed landmark batches fail before reaching opaque LSTM errors."""
        model = BiLSTMClassifier(
            BiLSTMConfig(num_classes=3, projection_size=8, hidden_size=6)
        )
        with self.assertRaisesRegex(ValueError, "shape"):
            model(torch.randn(2, 258))
        with self.assertRaisesRegex(ValueError, "Expected 258"):
            model(torch.randn(2, 3, 257))
        with self.assertRaisesRegex(TypeError, "floating-point"):
            model(torch.ones(2, 3, 258, dtype=torch.int64))
        with self.assertRaisesRegex(ValueError, "contiguous valid prefix"):
            model(
                torch.randn(1, 3, 258),
                attention_mask=torch.tensor([[True, False, True]]),
            )
        with self.assertRaisesRegex(ValueError, "boolean or binary"):
            model(
                torch.randn(1, 3, 258),
                attention_mask=torch.tensor([[1.0, 0.5, 0.0]]),
            )
        with self.assertRaisesRegex(ValueError, "describe different frames"):
            model(
                torch.randn(1, 3, 258),
                attention_mask=torch.tensor([[True, True, False]]),
                effective_lengths=torch.tensor([1]),
            )
        with self.assertRaisesRegex(ValueError, "must be positive"):
            model(torch.randn(1, 3, 258), effective_lengths=torch.tensor([0]))

    def test_configuration_and_factory_are_typed_and_extensible(self) -> None:
        """Factories accept typed/JSON-like configs and reject unsupported models."""
        typed = BiLSTMConfig(
            num_classes=5,
            projection_size=12,
            hidden_size=9,
            pooling="max",
        )
        typed_model = ModelFactory.create(typed)
        mapped_model = create_model(
            {
                "model_type": "bilstm",
                "num_classes": 5,
                "projection_size": 12,
                "hidden_size": 9,
                "num_layers": 1,
                "dropout": 0.0,
                "bidirectional": False,
                "pooling": "last",
            }
        )
        default_model = create_model({"num_classes": 5, "hidden_size": 9})

        self.assertIsInstance(typed_model, BaseModel)
        self.assertIsInstance(mapped_model, BiLSTMClassifier)
        self.assertIsInstance(default_model, BiLSTMClassifier)
        self.assertEqual(typed.to_dict()["model_type"], "bilstm")
        with self.assertRaisesRegex(ModelFactoryError, "Unsupported model"):
            create_model({"model_type": "transformer", "num_classes": 5})
        with self.assertRaisesRegex(ValueError, "dropout"):
            BiLSTMConfig(num_classes=5, dropout=1.0)
        with self.assertRaisesRegex(ModelFactoryError, "Unknown BiLSTM"):
            create_model({"model_type": "bilstm", "num_classes": 5, "unknown": True})

    def test_existing_trainer_trains_bilstm_without_an_adapter(self) -> None:
        """The existing Trainer forwards its landmark batch directly to BiLSTM."""
        with tempfile.TemporaryDirectory() as temporary_directory:
            model = BiLSTMClassifier(
                BiLSTMConfig(
                    num_classes=3,
                    projection_size=8,
                    hidden_size=6,
                    num_layers=2,
                    dropout=0.1,
                )
            )
            optimizer = torch.optim.Adam(model.parameters(), lr=0.01)
            trainer = Trainer(
                model,
                optimizer,
                LabelEncoder(("hello", "thanks", "welcome")),
                config=TrainerConfig(
                    epochs=1,
                    device="cpu",
                    checkpoint_dir=Path(temporary_directory) / "checkpoints",
                    seed=23,
                ),
            )
            lengths = torch.tensor([5, 3, 4])
            attention_mask = torch.arange(5).unsqueeze(0) < lengths.unsqueeze(1)
            batch: dict[str, object] = {
                "landmarks": torch.randn(3, 5, 258),
                "attention_mask": attention_mask,
                "lengths": lengths,
                "effective_lengths": lengths,
                "labels": torch.tensor([0, 1, 2]),
                "sample_ids": ["one", "two", "three"],
            }
            loader = [batch]

            history = trainer.train(loader, loader)
            result = trainer.validate(loader)

            self.assertEqual(len(history), 1)
            self.assertEqual(result.samples, 3)
            self.assertTrue(
                (Path(temporary_directory) / "checkpoints" / "latest.pt").is_file()
            )


if __name__ == "__main__":
    unittest.main()
