"""Held-out evaluation and reporting application for SignVerse models."""

from __future__ import annotations

import argparse
import csv
import json
import logging
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Mapping, Sequence

import numpy as np
from numpy.typing import NDArray

from ai.train import (
    TrainingApplicationConfig,
    build_data_loaders,
    create_application_trainer,
    load_training_config,
)

LOGGER = logging.getLogger("signverse.evaluate")


class EvaluationApplicationError(RuntimeError):
    """Raised when a checkpoint cannot be evaluated or reported."""


@dataclass(frozen=True, slots=True)
class ClassificationReportRow:
    """Per-class precision, recall, F1, support, and class accuracy."""

    label: str
    precision: float
    recall: float
    f1_score: float
    support: int
    accuracy: float


@dataclass(frozen=True, slots=True)
class EvaluationArtifacts:
    """Evaluation result paths and exported metric values."""

    output_dir: Path
    metrics_path: Path
    classification_report_path: Path
    confusion_matrix_path: Path
    confusion_matrix_image_path: Path
    metrics: Mapping[str, object]


def evaluate_checkpoint(
    checkpoint: str | Path,
    *,
    config_path: str | Path | None = None,
    output_dir: str | Path | None = None,
) -> EvaluationArtifacts:
    """Evaluate one checkpoint on its configured labeled test split."""
    checkpoint_path = Path(checkpoint).expanduser().resolve()
    if not checkpoint_path.is_file():
        raise EvaluationApplicationError(
            f"Checkpoint does not exist: {checkpoint_path}"
        )
    config = (
        load_training_config(config_path)
        if config_path is not None
        else load_checkpoint_run_config(checkpoint_path)
    )
    loaders = build_data_loaders(config)
    trainer = create_application_trainer(config, loaders.label_encoder)
    trainer.resume(checkpoint_path)
    result = trainer.test(loaders.test)
    labels = loaders.label_encoder.labels
    confusion = np.asarray(result.metrics.confusion_matrix, dtype=np.int64)
    rows = classification_report(confusion, labels)
    per_class_accuracy = {row.label: row.accuracy for row in rows}
    metrics: dict[str, object] = {
        "loss": result.loss,
        "samples": result.samples,
        "duration_seconds": result.duration_seconds,
        **result.metrics.to_dict(),
        "per_class_accuracy": per_class_accuracy,
    }
    destination = (
        Path(output_dir).expanduser().resolve()
        if output_dir is not None
        else config.paths.output_dir.expanduser().resolve()
    )
    destination.mkdir(parents=True, exist_ok=True)
    metrics_path = destination / "metrics.json"
    report_path = destination / "classification_report.csv"
    confusion_path = destination / "confusion_matrix.csv"
    image_path = destination / "confusion_matrix.png"
    _atomic_json(metrics_path, metrics)
    write_classification_report(rows, report_path)
    write_confusion_matrix(confusion, labels, confusion_path)
    plot_confusion_matrix(confusion, labels, image_path)
    LOGGER.info(
        "Evaluation complete: samples=%d accuracy=%.4f output=%s",
        result.samples,
        result.metrics.accuracy,
        destination,
    )
    return EvaluationArtifacts(
        output_dir=destination,
        metrics_path=metrics_path,
        classification_report_path=report_path,
        confusion_matrix_path=confusion_path,
        confusion_matrix_image_path=image_path,
        metrics=metrics,
    )


def load_checkpoint_run_config(checkpoint: str | Path) -> TrainingApplicationConfig:
    """Load the resolved run configuration stored beside a checkpoint."""
    checkpoint_path = Path(checkpoint).expanduser().resolve()
    candidates = (
        checkpoint_path.parent / "run_config.json",
        checkpoint_path.parent.parent / "run_config.json",
    )
    for candidate in candidates:
        if not candidate.is_file():
            continue
        try:
            raw = json.loads(candidate.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise EvaluationApplicationError(
                f"Unable to read run configuration {candidate}: {error}"
            ) from error
        if not isinstance(raw, dict):
            raise EvaluationApplicationError(
                f"Run configuration must be an object: {candidate}"
            )
        try:
            return TrainingApplicationConfig.from_mapping(raw)
        except (TypeError, ValueError) as error:
            raise EvaluationApplicationError(
                f"Invalid run configuration {candidate}: {error}"
            ) from error
    raise EvaluationApplicationError(
        "No run_config.json was found beside the checkpoint. Supply --config explicitly."
    )


def classification_report(
    confusion_matrix: NDArray[np.int64], labels: Sequence[str]
) -> list[ClassificationReportRow]:
    """Calculate deterministic per-class metrics from a confusion matrix."""
    _validate_confusion_matrix(confusion_matrix, labels)
    rows: list[ClassificationReportRow] = []
    for index, label in enumerate(labels):
        true_positive = int(confusion_matrix[index, index])
        support = int(confusion_matrix[index, :].sum())
        predicted = int(confusion_matrix[:, index].sum())
        precision = true_positive / predicted if predicted else 0.0
        recall = true_positive / support if support else 0.0
        f1_score = (
            2 * precision * recall / (precision + recall) if precision + recall else 0.0
        )
        rows.append(
            ClassificationReportRow(
                label=label,
                precision=precision,
                recall=recall,
                f1_score=f1_score,
                support=support,
                accuracy=recall,
            )
        )
    return rows


def write_classification_report(
    rows: Sequence[ClassificationReportRow], path: str | Path
) -> None:
    """Atomically export per-class metrics as CSV."""
    destination = Path(path).expanduser().resolve()
    temporary = destination.with_name(f".{destination.name}.tmp")
    try:
        with temporary.open("w", encoding="utf-8", newline="") as output:
            writer = csv.DictWriter(
                output,
                fieldnames=(
                    "label",
                    "precision",
                    "recall",
                    "f1_score",
                    "support",
                    "accuracy",
                ),
            )
            writer.writeheader()
            writer.writerows(asdict(row) for row in rows)
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)


def write_confusion_matrix(
    confusion_matrix: NDArray[np.int64],
    labels: Sequence[str],
    path: str | Path,
) -> None:
    """Atomically export a labeled raw confusion matrix as CSV."""
    _validate_confusion_matrix(confusion_matrix, labels)
    destination = Path(path).expanduser().resolve()
    temporary = destination.with_name(f".{destination.name}.tmp")
    try:
        with temporary.open("w", encoding="utf-8", newline="") as output:
            writer = csv.writer(output)
            writer.writerow(["actual\\predicted", *labels])
            for label, values in zip(labels, confusion_matrix.tolist(), strict=True):
                writer.writerow([label, *values])
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)


def plot_confusion_matrix(
    confusion_matrix: NDArray[np.int64],
    labels: Sequence[str],
    path: str | Path,
) -> None:
    """Generate a labeled confusion-matrix PNG using a noninteractive backend."""
    _validate_confusion_matrix(confusion_matrix, labels)
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    size = min(20.0, max(6.0, len(labels) * 0.45))
    figure, axis = plt.subplots(figsize=(size, size))
    image = axis.imshow(confusion_matrix, interpolation="nearest", cmap="Blues")
    figure.colorbar(image, ax=axis)
    positions = np.arange(len(labels))
    axis.set(
        title="Confusion Matrix",
        xlabel="Predicted label",
        ylabel="Actual label",
        xticks=positions,
        yticks=positions,
        xticklabels=labels,
        yticklabels=labels,
    )
    axis.tick_params(axis="x", labelrotation=90)
    if len(labels) <= 30:
        threshold = float(confusion_matrix.max()) / 2 if confusion_matrix.size else 0
        for row in range(confusion_matrix.shape[0]):
            for column in range(confusion_matrix.shape[1]):
                value = int(confusion_matrix[row, column])
                axis.text(
                    column,
                    row,
                    str(value),
                    ha="center",
                    va="center",
                    color="white" if value > threshold else "black",
                )
    figure.tight_layout()
    destination = Path(path).expanduser().resolve()
    temporary = destination.with_name(f".{destination.stem}.tmp.png")
    try:
        figure.savefig(temporary, dpi=150, bbox_inches="tight", format="png")
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)
        plt.close(figure)


def build_parser() -> argparse.ArgumentParser:
    """Build the held-out evaluation command-line parser."""
    parser = argparse.ArgumentParser(
        description="Evaluate a trained SignVerse checkpoint on labeled test data."
    )
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--config", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--log-level", default="INFO")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    """Run checkpoint evaluation from command-line arguments."""
    arguments = build_parser().parse_args(argv)
    logging.basicConfig(
        level=getattr(logging, str(arguments.log_level).upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    try:
        artifacts = evaluate_checkpoint(
            arguments.checkpoint,
            config_path=arguments.config,
            output_dir=arguments.output,
        )
    except Exception as error:
        LOGGER.error("Evaluation failed: %s", error)
        return 1
    LOGGER.info("Metrics written to %s", artifacts.metrics_path)
    return 0


def _validate_confusion_matrix(
    confusion_matrix: NDArray[np.int64], labels: Sequence[str]
) -> None:
    expected = (len(labels), len(labels))
    if confusion_matrix.ndim != 2 or confusion_matrix.shape != expected:
        raise ValueError(
            f"Confusion matrix must have shape {expected}, got {confusion_matrix.shape}."
        )
    if np.any(confusion_matrix < 0):
        raise ValueError("Confusion matrix counts must be non-negative.")


def _atomic_json(destination: Path, value: Mapping[str, object]) -> None:
    temporary = destination.with_name(f".{destination.name}.tmp")
    try:
        temporary.write_text(
            json.dumps(value, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)


if __name__ == "__main__":
    sys.exit(main())
