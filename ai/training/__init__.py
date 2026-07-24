"""PyTorch-compatible landmark dataset utilities for SignVerse AI."""

from .callbacks import Callback, CallbackContext, EarlyStopping
from .checkpoint import CheckpointError, CheckpointManager, ResumeState
from .collate import LandmarkBatch, LandmarkCollator, collate_landmark_batch
from .config import TrainerConfig
from .dataset import LandmarkDataset, LandmarkDatasetError, LandmarkDatasetItem
from .history import EpochRecord, TrainingHistory
from .label_encoder import LabelEncoder, LabelEncoderError
from .losses import ClassificationLossConfig, create_classification_loss
from .metrics import ClassificationMetrics, compute_classification_metrics
from .splits import LandmarkDatasetSplits, create_dataset_splits
from .statistics import LandmarkStatistics, generate_statistics, save_statistics
from .trainer import EvaluationResult, PredictionOutput, Trainer
from .utils import resolve_device, seed_everything

__all__ = [
    "Callback",
    "CallbackContext",
    "CheckpointError",
    "CheckpointManager",
    "ClassificationLossConfig",
    "ClassificationMetrics",
    "EarlyStopping",
    "EpochRecord",
    "EvaluationResult",
    "LabelEncoder",
    "LabelEncoderError",
    "LandmarkBatch",
    "LandmarkCollator",
    "LandmarkDataset",
    "LandmarkDatasetError",
    "LandmarkDatasetItem",
    "LandmarkDatasetSplits",
    "LandmarkStatistics",
    "PredictionOutput",
    "ResumeState",
    "Trainer",
    "TrainerConfig",
    "TrainingHistory",
    "collate_landmark_batch",
    "compute_classification_metrics",
    "create_dataset_splits",
    "create_classification_loss",
    "generate_statistics",
    "resolve_device",
    "save_statistics",
    "seed_everything",
]
