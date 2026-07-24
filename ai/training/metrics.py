"""Dependency-free multiclass classification metrics."""

from __future__ import annotations

from dataclasses import asdict, dataclass

import torch


@dataclass(frozen=True, slots=True)
class ClassificationMetrics:
    """Aggregate multiclass metrics calculated from model logits."""

    accuracy: float
    precision_macro: float
    precision_weighted: float
    recall_macro: float
    recall_weighted: float
    f1_macro: float
    f1_weighted: float
    top1_accuracy: float
    top5_accuracy: float | None
    confusion_matrix: list[list[int]]

    def to_dict(self) -> dict[str, object]:
        """Return a JSON-compatible metric mapping."""
        return asdict(self)


class ClassificationMetricAccumulator:
    """Incrementally collect multiclass statistics without retaining logits."""

    def __init__(self, num_classes: int) -> None:
        """Create zeroed counters for a positive number of classes."""
        if num_classes <= 1:
            raise ValueError("num_classes must be greater than one.")
        self.num_classes = num_classes
        self.confusion_matrix = torch.zeros(
            (num_classes, num_classes), dtype=torch.int64
        )
        self.total = 0
        self.top1_correct = 0
        self.top5_correct = 0

    def update(self, logits: torch.Tensor, targets: torch.Tensor) -> None:
        """Add one batch of ``(batch, classes)`` logits and target IDs."""
        if logits.ndim != 2 or logits.shape[1] != self.num_classes:
            raise ValueError(
                f"Expected logits shaped (batch, {self.num_classes}), got {tuple(logits.shape)}."
            )
        targets = targets.detach().to(device="cpu", dtype=torch.long).reshape(-1)
        if logits.shape[0] != targets.shape[0]:
            raise ValueError("Logit and target batch sizes do not match.")
        if targets.numel() == 0:
            return
        if torch.any(targets < 0) or torch.any(targets >= self.num_classes):
            raise ValueError(
                "Targets contain an ID outside the configured class range."
            )
        scores = logits.detach().to(device="cpu")
        predictions = scores.argmax(dim=1)
        encoded = targets * self.num_classes + predictions
        counts = torch.bincount(
            encoded, minlength=self.num_classes * self.num_classes
        ).reshape(self.num_classes, self.num_classes)
        self.confusion_matrix += counts
        self.total += int(targets.numel())
        self.top1_correct += int((predictions == targets).sum().item())
        if self.num_classes >= 5:
            top5 = scores.topk(5, dim=1).indices
            self.top5_correct += int(
                (top5 == targets.unsqueeze(1)).any(dim=1).sum().item()
            )

    def compute(self) -> ClassificationMetrics:
        """Calculate aggregate metrics from the current counters."""
        if self.total == 0:
            raise ValueError("Cannot compute classification metrics without samples.")
        matrix = self.confusion_matrix.to(torch.float64)
        true_positive = matrix.diag()
        support = matrix.sum(dim=1)
        predicted = matrix.sum(dim=0)
        precision = _safe_divide(true_positive, predicted)
        recall = _safe_divide(true_positive, support)
        f1 = _safe_divide(2 * precision * recall, precision + recall)
        weights = support / support.sum()
        accuracy = self.top1_correct / self.total
        return ClassificationMetrics(
            accuracy=accuracy,
            precision_macro=float(precision.mean().item()),
            precision_weighted=float((precision * weights).sum().item()),
            recall_macro=float(recall.mean().item()),
            recall_weighted=float((recall * weights).sum().item()),
            f1_macro=float(f1.mean().item()),
            f1_weighted=float((f1 * weights).sum().item()),
            top1_accuracy=accuracy,
            top5_accuracy=self.top5_correct / self.total
            if self.num_classes >= 5
            else None,
            confusion_matrix=self.confusion_matrix.tolist(),
        )


def compute_classification_metrics(
    logits: torch.Tensor, targets: torch.Tensor, *, num_classes: int | None = None
) -> ClassificationMetrics:
    """Calculate all supported metrics for one complete prediction tensor."""
    classes = (
        int(logits.shape[1])
        if num_classes is None and logits.ndim == 2
        else num_classes
    )
    if classes is None:
        raise ValueError("num_classes is required when logits are not two-dimensional.")
    accumulator = ClassificationMetricAccumulator(classes)
    accumulator.update(logits, targets)
    return accumulator.compute()


def _safe_divide(numerator: torch.Tensor, denominator: torch.Tensor) -> torch.Tensor:
    result = torch.zeros_like(numerator)
    populated = denominator != 0
    result[populated] = numerator[populated] / denominator[populated]
    return result
