"""Dataset registration and lookup primitives for SignVerse AI.

This module intentionally manages only local dataset locations and adapter
selection. Downloading, preprocessing, training, and inference belong to later
phases and are not part of this layer.
"""

from __future__ import annotations

import importlib
import csv
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import Any, ClassVar, TypeAlias

try:
    import yaml as _yaml  # type: ignore[import-untyped]
except ImportError:  # pragma: no cover - dependency error is environment-specific
    _yaml = None

SUPPORTED_VIDEO_EXTENSIONS = frozenset({".avi", ".mov", ".mp4"})


class DatasetManagerError(RuntimeError):
    """Base error for dataset registration and lookup failures."""


class DatasetNotRegisteredError(DatasetManagerError):
    """Raised when a requested dataset name has not been registered."""


class DatasetPathError(DatasetManagerError):
    """Raised when a registered dataset path is missing or invalid."""


@dataclass(frozen=True, slots=True)
class DatasetMetadata:
    """Basic descriptive metadata exposed by a dataset adapter."""

    name: str
    root: Path
    description: str = ""
    version: str | None = None


class BaseDatasetAdapter(ABC):
    """Abstract interface implemented by every supported dataset adapter."""

    def __init__(self, root: Path) -> None:
        """Initialize an adapter for an existing local dataset directory."""
        self.root = root

    @abstractmethod
    def scan(self) -> list[Path]:
        """Return dataset entries discovered beneath the configured root."""

    @abstractmethod
    def validate(self) -> bool:
        """Validate the dataset layout without modifying dataset contents."""

    @abstractmethod
    def metadata(self) -> DatasetMetadata:
        """Return descriptive metadata for the configured dataset."""


class FilesystemVideoDatasetAdapter(BaseDatasetAdapter):
    """Read-only adapter for datasets stored as nested video directories."""

    dataset_name: ClassVar[str] = "dataset"

    def __init__(self, root: Path) -> None:
        """Initialize cached video and annotation discovery."""
        super().__init__(root)
        self._videos: list[Path] | None = None
        self._annotations: dict[Path, tuple[str, str | None]] | None = None

    def scan(self) -> list[Path]:
        """Return supported videos recursively in deterministic order."""
        if self._videos is None:
            self._videos = sorted(
                path
                for path in self.root.rglob("*")
                if path.is_file()
                and path.suffix.casefold() in SUPPORTED_VIDEO_EXTENSIONS
            )
        return list(self._videos)

    def validate(self) -> bool:
        """Return whether the root exists and contains at least one video."""
        return self.root.is_dir() and bool(self.scan())

    def metadata(self) -> DatasetMetadata:
        """Return filesystem metadata without inspecting video contents."""
        return DatasetMetadata(
            name=self.dataset_name,
            root=self.root,
            description="Locally installed raw video dataset.",
        )

    def label_for(self, video: Path) -> str:
        """Infer a source label from the video's nearest dataset directory."""
        if annotation := self._annotation_for(video):
            return annotation[0]
        relative = video.relative_to(self.root)
        parent = relative.parent.name
        label = parent if parent and parent != "." else video.stem
        normalized = " ".join(label.replace("_", " ").split()).strip()
        if not normalized:
            raise DatasetManagerError(f"Unable to infer a label for video: {video}")
        return normalized

    def split_for(self, video: Path) -> str | None:
        """Return a recognized source split encoded in the relative path."""
        if annotation := self._annotation_for(video):
            if annotation[1] is not None:
                return annotation[1]
        aliases = {
            "train": "train",
            "training": "train",
            "val": "validation",
            "valid": "validation",
            "validation": "validation",
            "test": "test",
            "testing": "test",
        }
        relative = video.relative_to(self.root)
        for part in relative.parts[:-1]:
            if split := aliases.get(part.casefold()):
                return split
        return None

    def _annotation_for(self, video: Path) -> tuple[str, str | None] | None:
        if self._annotations is None:
            self._annotations = self._load_csv_annotations()
        return self._annotations.get(video.resolve())

    def _load_csv_annotations(self) -> dict[Path, tuple[str, str | None]]:
        videos = self.scan()
        by_name: dict[str, list[Path]] = {}
        for video in videos:
            by_name.setdefault(video.name.casefold(), []).append(video.resolve())
            by_name.setdefault(video.stem.casefold(), []).append(video.resolve())

        annotations: dict[Path, tuple[str, str | None]] = {}
        for csv_path in sorted(self.root.rglob("*.csv")):
            inferred_split = self._split_alias(csv_path.stem)
            try:
                with csv_path.open(encoding="utf-8-sig", newline="") as source:
                    for raw_row in csv.DictReader(source):
                        row = {
                            str(key).strip().casefold(): str(value).strip()
                            for key, value in raw_row.items()
                            if key is not None and value is not None
                        }
                        video_value = self._first_value(
                            row,
                            (
                                "video",
                                "video_id",
                                "video_url",
                                "video_path",
                                "videopath",
                                "path",
                                "file",
                                "filename",
                                "video_name",
                                "name",
                            ),
                        )
                        label = self._first_value(
                            row,
                            (
                                "label",
                                "category",
                                "class",
                                "word",
                                "gloss",
                                "sentence",
                                "text",
                            ),
                        )
                        if not video_value or not label:
                            continue
                        candidates = by_name.get(Path(video_value).name.casefold(), [])
                        if not candidates:
                            candidates = by_name.get(
                                Path(video_value).stem.casefold(), []
                            )
                        if len(set(candidates)) != 1:
                            continue
                        row_split = self._split_alias(row.get("split", ""))
                        annotations[candidates[0]] = (
                            label,
                            row_split or inferred_split,
                        )
            except (OSError, csv.Error) as error:
                raise DatasetManagerError(
                    f"Unable to read dataset annotations from {csv_path}: {error}"
                ) from error
        return annotations

    @staticmethod
    def _first_value(row: dict[str, str], keys: tuple[str, ...]) -> str | None:
        return next((row[key] for key in keys if row.get(key)), None)

    @staticmethod
    def _split_alias(value: str) -> str | None:
        normalized = value.strip().casefold()
        aliases = {
            "train": "train",
            "training": "train",
            "val": "validation",
            "valid": "validation",
            "validation": "validation",
            "test": "test",
            "testing": "test",
        }
        return aliases.get(normalized)


DatasetAdapterType: TypeAlias = type[BaseDatasetAdapter]


@dataclass(frozen=True, slots=True)
class DatasetRegistration:
    """A named association between a local path and an adapter class."""

    name: str
    path: Path
    adapter_type: DatasetAdapterType

    @property
    def installed(self) -> bool:
        """Return whether the registered path is an accessible directory."""
        return self.path.is_dir()


class DatasetManager:
    """Register local datasets and construct adapters for installed data."""

    def __init__(self) -> None:
        """Create an empty dataset registry."""
        self._registrations: dict[str, DatasetRegistration] = {}

    @classmethod
    def from_config(cls, config_path: str | Path) -> DatasetManager:
        """Build a manager from the project's YAML dataset registry."""
        if _yaml is None:
            raise DatasetManagerError(
                "PyYAML is required to load dataset configuration."
            )
        path = Path(config_path).expanduser().resolve()
        try:
            raw = _yaml.safe_load(path.read_text(encoding="utf-8"))
        except FileNotFoundError as error:
            raise DatasetManagerError(
                f"Dataset config does not exist: {path}"
            ) from error
        except (OSError, _yaml.YAMLError) as error:
            raise DatasetManagerError(
                f"Unable to read dataset config {path}: {error}"
            ) from error
        if not isinstance(raw, dict) or not isinstance(raw.get("datasets"), dict):
            raise DatasetManagerError(
                "Dataset config must contain a 'datasets' mapping."
            )

        manager = cls()
        project_root = path.parent.parent
        for name, entry in raw["datasets"].items():
            if not isinstance(name, str) or not isinstance(entry, dict):
                raise DatasetManagerError(
                    "Every dataset entry must be a named mapping."
                )
            manager.register_dataset(
                name,
                project_root / cls._config_string(entry, "path", name),
                cls._load_adapter(cls._config_string(entry, "adapter", name)),
            )
        return manager

    def register_dataset(
        self,
        name: str,
        path: str | Path,
        adapter_type: DatasetAdapterType,
    ) -> DatasetRegistration:
        """Register or replace a named dataset configuration.

        Registration does not download data and does not require the path to
        exist yet. Use :meth:`verify_dataset_path` or :meth:`get_adapter` when
        an installed dataset is required.
        """
        normalized_name = self._normalize_name(name)
        if not issubclass(adapter_type, BaseDatasetAdapter):
            raise TypeError("adapter_type must inherit from BaseDatasetAdapter")

        registration = DatasetRegistration(
            name=normalized_name,
            path=Path(path).expanduser().resolve(),
            adapter_type=adapter_type,
        )
        self._registrations[normalized_name] = registration
        return registration

    def verify_dataset_path(self, name: str) -> Path:
        """Return an installed dataset path or raise a clear path error."""
        registration = self._registration_for(name)
        if not registration.path.exists():
            raise DatasetPathError(
                f"Dataset '{registration.name}' is not installed: "
                f"{registration.path} does not exist."
            )
        if not registration.path.is_dir():
            raise DatasetPathError(
                f"Dataset '{registration.name}' has an invalid path: "
                f"{registration.path} is not a directory."
            )
        return registration.path

    def list_installed_datasets(self) -> tuple[DatasetRegistration, ...]:
        """Return installed registrations ordered by dataset name."""
        return tuple(
            registration
            for _, registration in sorted(self._registrations.items())
            if registration.installed
        )

    def get_adapter(self, name: str) -> BaseDatasetAdapter:
        """Construct the registered adapter for an installed dataset."""
        registration = self._registration_for(name)
        verified_path = self.verify_dataset_path(registration.name)
        return registration.adapter_type(verified_path)

    def _registration_for(self, name: str) -> DatasetRegistration:
        normalized_name = self._normalize_name(name)
        try:
            return self._registrations[normalized_name]
        except KeyError as error:
            available = ", ".join(sorted(self._registrations)) or "none"
            raise DatasetNotRegisteredError(
                f"Dataset '{normalized_name}' is not registered. "
                f"Registered datasets: {available}."
            ) from error

    @staticmethod
    def _normalize_name(name: str) -> str:
        normalized_name = name.strip().casefold()
        if not normalized_name:
            raise ValueError("Dataset name must not be empty.")
        return normalized_name

    @staticmethod
    def _config_string(entry: dict[str, Any], key: str, dataset_name: str) -> str:
        value = entry.get(key)
        if not isinstance(value, str) or not value.strip():
            raise DatasetManagerError(
                f"Dataset '{dataset_name}' requires a non-empty '{key}' value."
            )
        return value

    @staticmethod
    def _load_adapter(dotted_path: str) -> DatasetAdapterType:
        module_name, separator, class_name = dotted_path.rpartition(".")
        if not separator:
            raise DatasetManagerError(
                f"Dataset adapter must be a dotted class path: {dotted_path}"
            )
        try:
            adapter = getattr(importlib.import_module(module_name), class_name)
        except (ImportError, AttributeError) as error:
            raise DatasetManagerError(
                f"Unable to import dataset adapter '{dotted_path}'."
            ) from error
        if not isinstance(adapter, type) or not issubclass(adapter, BaseDatasetAdapter):
            raise DatasetManagerError(
                f"Configured adapter '{dotted_path}' is not a BaseDatasetAdapter."
            )
        return adapter
