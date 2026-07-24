"""Device, reproducibility, batch, and optimizer utilities."""

from __future__ import annotations

import inspect
import logging
import random
from typing import Any, Callable, Mapping, TypeAlias, cast

import numpy as np
import torch
from torch import nn

from .config import DeviceName

LOGGER = logging.getLogger("signverse.training.utils")
Batch: TypeAlias = Mapping[str, object]
ForwardFunction: TypeAlias = Callable[[nn.Module, Batch], torch.Tensor]


def resolve_device(selection: DeviceName = "auto") -> torch.device:
    """Resolve an explicit or best-available CPU/GPU device."""
    if selection == "auto":
        if torch.cuda.is_available():
            return torch.device("cuda")
        if torch.backends.mps.is_available():
            return torch.device("mps")
        return torch.device("cpu")
    if selection == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("CUDA was requested but is not available.")
    if selection == "mps" and not torch.backends.mps.is_available():
        raise RuntimeError("MPS was requested but is not available.")
    return torch.device(selection)


def seed_everything(seed: int, *, deterministic: bool = True) -> None:
    """Seed Python, NumPy, and PyTorch and configure deterministic algorithms."""
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    torch.use_deterministic_algorithms(deterministic, warn_only=True)
    if torch.backends.cudnn.enabled:
        torch.backends.cudnn.deterministic = deterministic
        torch.backends.cudnn.benchmark = not deterministic


def move_batch_to_device(batch: Batch, device: torch.device) -> dict[str, object]:
    """Move every tensor in a batch mapping to the selected device."""
    return {
        key: value.to(device, non_blocking=True)
        if isinstance(value, torch.Tensor)
        else value
        for key, value in batch.items()
    }


def labels_from_batch(batch: Batch) -> torch.Tensor:
    """Return and validate the integer label tensor in a batch."""
    labels = batch.get("labels")
    if not isinstance(labels, torch.Tensor):
        raise TypeError("Training batches must contain a 'labels' tensor.")
    return labels.to(dtype=torch.long)


def default_forward(model: nn.Module, batch: Batch) -> torch.Tensor:
    """Call a sequence model with supported landmark batch fields.

    ``landmarks`` is always the first positional argument. Attention masks and
    lengths are forwarded only when the model declares matching parameters.
    More specialized models can provide a custom ``ForwardFunction``.
    """
    landmarks = batch.get("landmarks")
    if not isinstance(landmarks, torch.Tensor):
        raise TypeError("Batches must contain a 'landmarks' tensor.")
    signature = inspect.signature(model.forward)
    accepts_kwargs = any(
        parameter.kind is inspect.Parameter.VAR_KEYWORD
        for parameter in signature.parameters.values()
    )
    optional: dict[str, object] = {}
    for name in ("attention_mask", "lengths", "effective_lengths"):
        if name in batch and (accepts_kwargs or name in signature.parameters):
            optional[name] = batch[name]
    output = model(landmarks, **optional)
    if not isinstance(output, torch.Tensor):
        raise TypeError("Model forward must return a logits tensor.")
    return output


def current_learning_rate(optimizer: torch.optim.Optimizer) -> float:
    """Return the learning rate of the optimizer's first parameter group."""
    if not optimizer.param_groups:
        raise ValueError("Optimizer contains no parameter groups.")
    return float(optimizer.param_groups[0]["lr"])


def capture_rng_state() -> dict[str, Any]:
    """Capture Python, NumPy, CPU, and optional CUDA RNG states."""
    state: dict[str, Any] = {
        "python": random.getstate(),
        "numpy": np.random.get_state(),
        "torch": torch.get_rng_state(),
    }
    if torch.cuda.is_available():
        state["cuda"] = torch.cuda.get_rng_state_all()
    return state


def restore_rng_state(state: Mapping[str, Any]) -> None:
    """Restore available RNG state saved in a checkpoint."""
    if "python" in state:
        random.setstate(cast(tuple[Any, ...], state["python"]))
    if "numpy" in state:
        np.random.set_state(cast(tuple[Any, ...], state["numpy"]))
    if "torch" in state and isinstance(state["torch"], torch.Tensor):
        torch.set_rng_state(state["torch"])
    cuda_state = state.get("cuda")
    if torch.cuda.is_available() and isinstance(cuda_state, list):
        torch.cuda.set_rng_state_all(cuda_state)
