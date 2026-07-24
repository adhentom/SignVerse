"""Configuration-driven construction of SignVerse models."""

from __future__ import annotations

import logging
from typing import Any, Mapping

from .base import BaseModel
from .bilstm import BiLSTMClassifier, BiLSTMConfig

LOGGER = logging.getLogger("signverse.models.factory")


class ModelFactoryError(ValueError):
    """Raised when a model type or configuration cannot be constructed."""


class ModelFactory:
    """Instantiate supported production models from typed or mapping configs."""

    @classmethod
    def create(cls, config: BiLSTMConfig | Mapping[str, Any]) -> BaseModel:
        """Build the model selected by ``model_type`` or ``name``."""
        try:
            model_type: str
            if isinstance(config, BiLSTMConfig):
                parsed = config
                model_type = config.model_type
            else:
                model_type = str(config.get("model_type", config.get("name", "bilstm")))
                if model_type != "bilstm":
                    raise ModelFactoryError(
                        f"Unsupported model type {model_type!r}. Supported: bilstm."
                    )
                parsed = BiLSTMConfig.from_dict(config)
            LOGGER.info("Instantiating model type '%s'.", model_type)
            return BiLSTMClassifier(parsed)
        except ModelFactoryError:
            raise
        except (TypeError, ValueError) as error:
            raise ModelFactoryError(f"Unable to create model: {error}") from error


def create_model(config: BiLSTMConfig | Mapping[str, Any]) -> BaseModel:
    """Convenience wrapper around :meth:`ModelFactory.create`."""
    return ModelFactory.create(config)
