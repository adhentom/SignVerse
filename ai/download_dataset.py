"""Configuration-driven dataset downloads for SignVerse AI.

The module downloads and extracts raw dataset files only. It deliberately does
not perform preprocessing, landmark extraction, training, or inference.

Example::

    python -m ai.download_dataset isl-csltr
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
import shutil
import sys
import tarfile
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Final, Mapping, Protocol, Sequence, cast

try:
    import yaml as _yaml  # type: ignore[import-untyped]
except ImportError:  # pragma: no cover - exercised only without the dependency
    _yaml = None


DEFAULT_CONFIG: Final[Path] = Path("configs/datasets.yaml")
CHUNK_SIZE: Final[int] = 1024 * 1024
SUPPORTED_SOURCES: Final[frozenset[str]] = frozenset(
    {"kaggle", "huggingface", "github_release", "manual_url"}
)
LOGGER = logging.getLogger("signverse.download_dataset")


class DatasetDownloadError(RuntimeError):
    """Base error for dataset configuration and download failures."""


class DatasetConfigurationError(DatasetDownloadError):
    """Raised when a dataset configuration is missing or invalid."""


class DatasetAuthenticationError(DatasetDownloadError):
    """Raised when a provider requires unavailable credentials."""


class DatasetNetworkError(DatasetDownloadError):
    """Raised when a remote dataset cannot be downloaded."""


class DatasetExtractionError(DatasetDownloadError):
    """Raised when an archive is invalid or unsafe to extract."""


class DatasetValidationError(DatasetDownloadError):
    """Raised when downloaded dataset contents fail validation."""


@dataclass(frozen=True, slots=True)
class ValidationConfig:
    """Declarative checks applied after extraction."""

    min_files: int = 1
    required_globs: tuple[str, ...] = ()
    allowed_extensions: tuple[str, ...] = ()
    min_matching_files: int = 0


@dataclass(frozen=True, slots=True)
class DatasetSource:
    """Provider-specific source configuration."""

    type: str
    url: str | None = None
    dataset: str | None = None
    repo_id: str | None = None
    revision: str = "main"
    filename: str | None = None
    repository: str | None = None
    tag: str | None = None
    asset: str | None = None


@dataclass(frozen=True, slots=True)
class DatasetConfig:
    """Complete download configuration for one dataset."""

    name: str
    destination: Path
    archive_name: str
    source: DatasetSource
    extract: bool = True
    strip_single_root: bool = True
    sha256: str | None = None
    validation: ValidationConfig = field(default_factory=ValidationConfig)


@dataclass(frozen=True, slots=True)
class DownloadRequest:
    """Resolved URL and headers used by the resumable downloader."""

    url: str
    headers: Mapping[str, str]


@dataclass(frozen=True, slots=True)
class DownloadResult:
    """Result returned after a dataset is installed or already available."""

    name: str
    destination: Path
    archive: Path
    downloaded: bool


class KaggleApiClient(Protocol):
    """Official Kaggle API operations used by the transport adapter."""

    def authenticate(self) -> None:
        """Authenticate using Kaggle's standard credential discovery."""

    def dataset_download_files(
        self,
        dataset: str,
        path: str | None = None,
        force: bool = False,
        quiet: bool = True,
        unzip: bool = False,
    ) -> None:
        """Download a dataset archive into a directory."""


class DatasetDownloader:
    """Download configured raw datasets without transforming their contents."""

    def __init__(self, config_path: str | Path = DEFAULT_CONFIG) -> None:
        """Load dataset definitions from a YAML configuration file."""
        LOGGER.info("DatasetDownloader initialization started: config=%s", config_path)
        self.config_path = Path(config_path).expanduser().resolve()
        self.project_root = self.config_path.parent.parent
        self._datasets = self._load_config(self.config_path)
        LOGGER.info(
            "DatasetDownloader initialization completed: config=%s datasets=%d",
            self.config_path,
            len(self._datasets),
        )

    def available_datasets(self) -> tuple[str, ...]:
        """Return configured dataset names in deterministic order."""
        return tuple(sorted(self._datasets))

    def download(self, name: str, *, force: bool = False) -> DownloadResult:
        """Download, extract, and validate a configured dataset.

        Existing valid installations are reused. ``force=True`` replaces an
        existing invalid or valid destination after the archive is available.
        """
        LOGGER.info("Dataset download started: dataset=%s force=%s", name, force)
        LOGGER.info("Dataset lookup started: dataset=%s", name)
        config = self._dataset(name)
        LOGGER.info(
            "Dataset lookup completed: dataset=%s destination=%s",
            config.name,
            config.destination,
        )
        if config.destination.exists() and not force:
            LOGGER.info(
                "Existing destination detected; validation started: dataset=%s path=%s",
                config.name,
                config.destination,
            )
            self.validate(config)
            LOGGER.info(
                "Existing destination validation completed: dataset=%s", config.name
            )
            LOGGER.info(
                "Dataset download completed without transfer: dataset=%s", config.name
            )
            return DownloadResult(
                name=config.name,
                destination=config.destination,
                archive=self._archive_path(config),
                downloaded=False,
            )

        LOGGER.info(
            "Provider selection started: dataset=%s provider=%s",
            config.name,
            config.source.type,
        )
        request = (
            None
            if config.source.type == "kaggle"
            else self._build_request(config.source)
        )
        if config.source.type == "kaggle" and (
            not config.source.dataset or "/" not in config.source.dataset
        ):
            raise DatasetConfigurationError(
                "Kaggle sources require 'dataset' in 'owner/slug' format."
            )
        LOGGER.info(
            "Provider selection completed: dataset=%s provider=%s",
            config.name,
            config.source.type,
        )
        archive_path = self._archive_path(config)
        LOGGER.info(
            "Destination path creation started: archive_parent=%s dataset_destination=%s",
            archive_path.parent,
            config.destination,
        )
        archive_path.parent.mkdir(parents=True, exist_ok=True)
        LOGGER.info(
            "Destination path creation completed: archive_parent=%s",
            archive_path.parent,
        )
        LOGGER.info(
            "Archive download invocation started: dataset=%s archive=%s",
            config.name,
            archive_path,
        )
        if config.source.type == "kaggle":
            if config.source.dataset is None:
                raise DatasetConfigurationError(
                    "Kaggle sources require 'dataset' in 'owner/slug' format."
                )
            self._download_kaggle(config.source.dataset, archive_path)
        else:
            if request is None:
                raise DatasetConfigurationError(
                    f"No download request was created for provider '{config.source.type}'."
                )
            self._download_resumable(request, archive_path)
        LOGGER.info(
            "Archive download invocation completed: dataset=%s archive=%s",
            config.name,
            archive_path,
        )
        LOGGER.info("Checksum verification started: archive=%s", archive_path)
        self._verify_checksum(archive_path, config.sha256)
        LOGGER.info("Checksum verification completed: archive=%s", archive_path)

        if force and config.destination.exists():
            LOGGER.info(
                "Forced destination replacement started: path=%s", config.destination
            )
            self._remove_destination(config.destination)
            LOGGER.info(
                "Forced destination replacement completed: path=%s",
                config.destination,
            )

        if config.extract:
            LOGGER.info(
                "Extraction started: archive=%s destination=%s",
                archive_path,
                config.destination,
            )
            self._extract_atomic(config, archive_path)
            LOGGER.info(
                "Extraction completed: archive=%s destination=%s",
                archive_path,
                config.destination,
            )
        else:
            LOGGER.info(
                "Archive copy started: archive=%s destination=%s",
                archive_path,
                config.destination,
            )
            config.destination.mkdir(parents=True, exist_ok=True)
            shutil.copy2(archive_path, config.destination / archive_path.name)
            LOGGER.info(
                "Archive copy completed: archive=%s destination=%s",
                archive_path,
                config.destination,
            )

        LOGGER.info(
            "Dataset validation started: dataset=%s destination=%s",
            config.name,
            config.destination,
        )
        self.validate(config)
        LOGGER.info("Dataset validation completed: dataset=%s", config.name)
        LOGGER.info("Install manifest write started: dataset=%s", config.name)
        self._write_install_manifest(config, archive_path)
        LOGGER.info("Install manifest write completed: dataset=%s", config.name)
        LOGGER.info(
            "Dataset download completed: dataset=%s destination=%s",
            config.name,
            config.destination,
        )
        return DownloadResult(
            name=config.name,
            destination=config.destination,
            archive=archive_path,
            downloaded=True,
        )

    def validate(self, config_or_name: DatasetConfig | str) -> None:
        """Validate an installed dataset against its configured checks."""
        config = (
            config_or_name
            if isinstance(config_or_name, DatasetConfig)
            else self._dataset(config_or_name)
        )
        destination = config.destination
        LOGGER.info(
            "Validation inspection started: dataset=%s destination=%s",
            config.name,
            destination,
        )
        if not destination.is_dir():
            raise DatasetValidationError(
                f"Dataset '{config.name}' is not installed at {destination}."
            )

        files = [path for path in destination.rglob("*") if path.is_file()]
        content_files = [
            path for path in files if path.name != ".signverse_dataset.json"
        ]
        LOGGER.info(
            "Validation file scan completed: dataset=%s content_files=%d",
            config.name,
            len(content_files),
        )
        if len(content_files) < config.validation.min_files:
            raise DatasetValidationError(
                f"Dataset '{config.name}' contains {len(content_files)} files; "
                f"at least {config.validation.min_files} are required."
            )

        for pattern in config.validation.required_globs:
            if not any(path.is_file() for path in destination.glob(pattern)):
                raise DatasetValidationError(
                    f"Dataset '{config.name}' is missing required content "
                    f"matching '{pattern}'."
                )

        if config.validation.allowed_extensions:
            extensions = set(config.validation.allowed_extensions)
            matching = [
                path for path in content_files if path.suffix.casefold() in extensions
            ]
            if len(matching) < config.validation.min_matching_files:
                raise DatasetValidationError(
                    f"Dataset '{config.name}' contains {len(matching)} files with "
                    f"allowed extensions; at least "
                    f"{config.validation.min_matching_files} are required."
                )
        LOGGER.info("Validation inspection completed: dataset=%s", config.name)

    def _dataset(self, name: str) -> DatasetConfig:
        normalized = name.strip().casefold()
        LOGGER.info(
            "Resolving configured dataset: requested=%s normalized=%s", name, normalized
        )
        try:
            config = self._datasets[normalized]
        except KeyError as error:
            available = ", ".join(self.available_datasets()) or "none"
            raise DatasetConfigurationError(
                f"Dataset '{normalized}' is not configured. Available datasets: {available}."
            ) from error
        LOGGER.info(
            "Resolved configured dataset: dataset=%s provider=%s",
            config.name,
            config.source.type,
        )
        return config

    def _archive_path(self, config: DatasetConfig) -> Path:
        return self.project_root / ".downloads" / config.name / config.archive_name

    def _build_request(self, source: DatasetSource) -> DownloadRequest:
        LOGGER.info("Provider request construction started: provider=%s", source.type)
        if source.type == "kaggle":
            raise DatasetConfigurationError(
                "Kaggle sources must use the official Kaggle API transport."
            )

        if source.type == "huggingface":
            if source.url:
                url = source.url
            elif source.repo_id and source.filename:
                filename = urllib.parse.quote(source.filename, safe="/")
                revision = urllib.parse.quote(source.revision, safe="")
                url = (
                    f"https://huggingface.co/datasets/{source.repo_id}/resolve/"
                    f"{revision}/{filename}?download=true"
                )
            else:
                raise DatasetConfigurationError(
                    "Hugging Face sources require 'url' or both 'repo_id' and 'filename'."
                )
            hf_token = os.getenv("HF_TOKEN") or os.getenv("HUGGING_FACE_HUB_TOKEN")
            headers = {"Authorization": f"Bearer {hf_token}"} if hf_token else {}
            request = DownloadRequest(url=url, headers=headers)
            LOGGER.info("Provider request construction completed: provider=huggingface")
            return request

        if source.type == "github_release":
            if source.url:
                url = source.url
            elif source.repository and source.tag and source.asset:
                asset = urllib.parse.quote(source.asset, safe="")
                url = (
                    f"https://github.com/{source.repository}/releases/download/"
                    f"{source.tag}/{asset}"
                )
            else:
                raise DatasetConfigurationError(
                    "GitHub release sources require 'url' or 'repository', 'tag', and 'asset'."
                )
            github_token = os.getenv("GITHUB_TOKEN")
            headers = {
                "Accept": "application/octet-stream",
                **({"Authorization": f"Bearer {github_token}"} if github_token else {}),
            }
            request = DownloadRequest(url=url, headers=headers)
            LOGGER.info(
                "Provider request construction completed: provider=github_release"
            )
            return request

        if source.type == "manual_url":
            if not source.url:
                raise DatasetConfigurationError("Manual URL sources require 'url'.")
            request = DownloadRequest(url=source.url, headers={})
            LOGGER.info("Provider request construction completed: provider=manual_url")
            return request

        raise DatasetConfigurationError(
            f"Unsupported dataset source '{source.type}'. "
            f"Supported sources: {', '.join(sorted(SUPPORTED_SOURCES))}."
        )

    @staticmethod
    def _initialize_kaggle_api() -> KaggleApiClient:
        LOGGER.info("Kaggle API initialization started")
        try:
            from kaggle.api.kaggle_api_extended import (  # type: ignore[import-not-found]
                KaggleApi,
            )
        except ImportError:
            raise DatasetConfigurationError(
                "Install Kaggle with:\n\npip install kaggle"
            ) from None
        except Exception as error:
            raise DatasetAuthenticationError(
                f"Kaggle API initialization failed: {error}"
            ) from None

        try:
            api = KaggleApi()
            LOGGER.info("Kaggle API initialization completed")
            LOGGER.info("Kaggle authentication started")
            api.authenticate()
            LOGGER.info("Kaggle authentication succeeded")
        except Exception as error:
            raise DatasetAuthenticationError(
                f"Kaggle authentication failed: {error}"
            ) from None
        return cast(KaggleApiClient, api)

    @classmethod
    def _download_kaggle(
        cls,
        dataset: str,
        destination: Path,
        *,
        retries: int = 3,
    ) -> None:
        """Download one Kaggle dataset through the official Python API."""
        api = cls._initialize_kaggle_api()
        dataset_slug = dataset.split("/", maxsplit=2)[1]
        api_archive = destination.parent / f"{dataset_slug}.zip"
        last_error: Exception | None = None
        for attempt in range(1, retries + 1):
            LOGGER.info(
                "Kaggle download attempt started: attempt=%d/%d dataset=%s path=%s",
                attempt,
                retries,
                dataset,
                destination.parent,
            )
            try:
                LOGGER.info(
                    "Kaggle download started: dataset=%s path=%s quiet=false unzip=false",
                    dataset,
                    destination.parent,
                )
                api.dataset_download_files(
                    dataset,
                    path=str(destination.parent),
                    unzip=False,
                    force=False,
                    quiet=False,
                )
                LOGGER.info(
                    "Kaggle download completed: dataset=%s path=%s",
                    dataset,
                    destination.parent,
                )
                if not api_archive.is_file():
                    raise FileNotFoundError(
                        f"Kaggle API did not create the expected archive: {api_archive}"
                    )
                if api_archive != destination:
                    api_archive.replace(destination)
                LOGGER.info(
                    "Kaggle archive path resolved: dataset=%s archive=%s size_bytes=%d",
                    dataset,
                    destination,
                    destination.stat().st_size,
                )
                return
            except Exception as error:
                if cls._is_kaggle_authentication_error(error):
                    raise DatasetAuthenticationError(
                        f"Kaggle rejected authentication for dataset '{dataset}': {error}"
                    ) from None
                last_error = error
                LOGGER.info(
                    "Kaggle download attempt failed: attempt=%d/%d "
                    "error_type=%s error=%s",
                    attempt,
                    retries,
                    type(error).__name__,
                    error,
                )
                if attempt < retries:
                    delay = 2 ** (attempt - 1)
                    LOGGER.info(
                        "Kaggle retry delay started: seconds=%d next_attempt=%d",
                        delay,
                        attempt + 1,
                    )
                    time.sleep(delay)
                    LOGGER.info("Kaggle retry delay completed: seconds=%d", delay)

        if last_error is None:
            raise DatasetNetworkError(
                f"Kaggle download failed without an error: dataset={dataset}"
            )
        raise DatasetNetworkError(
            f"Kaggle download failed after {retries} attempts for '{dataset}': "
            f"{last_error}"
        ) from None

    @staticmethod
    def _is_kaggle_authentication_error(error: Exception) -> bool:
        status = getattr(error, "status", None)
        if status in {401, 403}:
            return True
        message = str(error).casefold()
        return any(
            marker in message
            for marker in (
                "unauthorized",
                "forbidden",
                "authentication",
                "credentials",
            )
        )

    @staticmethod
    def _download_resumable(
        request: DownloadRequest,
        destination: Path,
        *,
        retries: int = 3,
    ) -> None:
        partial = destination.with_name(f"{destination.name}.part")
        LOGGER.info(
            "Resumable HTTP download started: destination=%s retries=%d",
            destination,
            retries,
        )
        for attempt in range(1, retries + 1):
            offset = partial.stat().st_size if partial.exists() else 0
            LOGGER.info(
                "HTTP attempt started: attempt=%d/%d resume_offset=%d destination=%s",
                attempt,
                retries,
                offset,
                destination,
            )
            headers = {
                "User-Agent": "SignVerse-Dataset-Downloader/1.0",
                **request.headers,
            }
            if offset:
                headers["Range"] = f"bytes={offset}-"
            http_request = urllib.request.Request(request.url, headers=headers)
            try:
                LOGGER.info(
                    "HTTP request invocation started: method=GET url=%s "
                    "timeout_seconds=60 timeout_scope=socket_operations "
                    "total_deadline=none",
                    request.url,
                )
                with urllib.request.urlopen(http_request, timeout=60) as response:
                    response_headers = getattr(response, "headers", {})
                    LOGGER.info(
                        "HTTP request invocation completed: status=%d content_length=%s",
                        response.status,
                        response_headers.get("Content-Length", "unknown"),
                    )
                    status = response.status
                    append = offset > 0 and status == 206
                    mode = "ab" if append else "wb"
                    transferred = 0
                    LOGGER.info(
                        "HTTP response streaming started: destination=%s mode=%s",
                        partial,
                        mode,
                    )
                    with partial.open(mode) as output:
                        while chunk := response.read(CHUNK_SIZE):
                            output.write(chunk)
                            transferred += len(chunk)
                    LOGGER.info(
                        "HTTP response streaming completed: bytes=%d destination=%s",
                        transferred,
                        partial,
                    )
                partial.replace(destination)
                LOGGER.info(
                    "Resumable HTTP download completed: destination=%s size_bytes=%d",
                    destination,
                    destination.stat().st_size,
                )
                return
            except urllib.error.HTTPError as error:
                LOGGER.info(
                    "HTTP attempt failed: attempt=%d status=%d reason=%s",
                    attempt,
                    error.code,
                    error.reason,
                )
                if error.code in {401, 403}:
                    raise DatasetAuthenticationError(
                        "The dataset provider rejected authentication. Check provider "
                        "credentials and confirm that the dataset terms have been accepted."
                    ) from error
                if error.code == 404:
                    raise DatasetNetworkError(
                        f"Dataset download was not found at {request.url}."
                    ) from error
                if error.code == 416 and partial.exists():
                    partial.replace(destination)
                    return
                last_error: Exception = error
            except (TimeoutError, urllib.error.URLError, OSError) as error:
                LOGGER.info(
                    "HTTP attempt failed: attempt=%d error_type=%s error=%s",
                    attempt,
                    type(error).__name__,
                    error,
                )
                last_error = error

            if attempt < retries:
                delay = 2 ** (attempt - 1)
                LOGGER.info(
                    "HTTP retry delay started: seconds=%d next_attempt=%d",
                    delay,
                    attempt + 1,
                )
                time.sleep(delay)
                LOGGER.info("HTTP retry delay completed: seconds=%d", delay)

        LOGGER.info(
            "Resumable HTTP download exhausted retries: destination=%s retries=%d",
            destination,
            retries,
        )
        raise DatasetNetworkError(
            f"Download failed after {retries} attempts: {last_error}"
        ) from last_error

    @staticmethod
    def _verify_checksum(path: Path, expected: str | None) -> None:
        if not expected:
            return
        digest = hashlib.sha256()
        with path.open("rb") as source:
            while chunk := source.read(CHUNK_SIZE):
                digest.update(chunk)
        actual = digest.hexdigest()
        if actual.casefold() != expected.casefold():
            raise DatasetValidationError(
                f"Checksum mismatch for {path}: expected {expected}, received {actual}."
            )

    def _extract_atomic(self, config: DatasetConfig, archive: Path) -> None:
        LOGGER.info(
            "Extraction destination path creation started: parent=%s",
            config.destination.parent,
        )
        config.destination.parent.mkdir(parents=True, exist_ok=True)
        LOGGER.info(
            "Extraction destination path creation completed: parent=%s",
            config.destination.parent,
        )
        temporary = Path(
            tempfile.mkdtemp(
                prefix=f".{config.name}-extract-",
                dir=config.destination.parent,
            )
        )
        LOGGER.info("Atomic extraction workspace created: temporary=%s", temporary)
        try:
            LOGGER.info(
                "Archive extraction invocation started: archive=%s temporary=%s",
                archive,
                temporary,
            )
            self._extract_archive(archive, temporary)
            LOGGER.info(
                "Archive extraction invocation completed: archive=%s temporary=%s",
                archive,
                temporary,
            )
            extracted_root = (
                self._single_root(temporary) if config.strip_single_root else temporary
            )
            if config.destination.exists():
                raise DatasetExtractionError(
                    f"Destination {config.destination} already exists. Use --force to replace it."
                )
            if extracted_root == temporary:
                temporary.replace(config.destination)
            else:
                extracted_root.replace(config.destination)
                shutil.rmtree(temporary, ignore_errors=True)
            LOGGER.info(
                "Atomic extraction publication completed: destination=%s",
                config.destination,
            )
        except Exception:
            LOGGER.info(
                "Atomic extraction cleanup started after failure: temporary=%s",
                temporary,
            )
            shutil.rmtree(temporary, ignore_errors=True)
            LOGGER.info(
                "Atomic extraction cleanup completed after failure: temporary=%s",
                temporary,
            )
            raise

    @staticmethod
    def _extract_archive(archive: Path, destination: Path) -> None:
        try:
            LOGGER.info("Archive format detection started: archive=%s", archive)
            if zipfile.is_zipfile(archive):
                LOGGER.info("Archive format detected: archive=%s format=zip", archive)
                with zipfile.ZipFile(archive) as source:
                    LOGGER.info("ZIP integrity validation started: archive=%s", archive)
                    bad_file = source.testzip()
                    if bad_file:
                        raise DatasetExtractionError(
                            f"ZIP archive is corrupted at member '{bad_file}'."
                        )
                    DatasetDownloader._validate_archive_members(
                        destination, [member.filename for member in source.infolist()]
                    )
                    LOGGER.info(
                        "ZIP integrity validation completed: archive=%s members=%d",
                        archive,
                        len(source.infolist()),
                    )
                    LOGGER.info("ZIP extraction started: archive=%s", archive)
                    source.extractall(destination)
                    LOGGER.info("ZIP extraction completed: archive=%s", archive)
                return
            if tarfile.is_tarfile(archive):
                LOGGER.info("Archive format detected: archive=%s format=tar", archive)
                with tarfile.open(archive) as source:
                    LOGGER.info("TAR member validation started: archive=%s", archive)
                    DatasetDownloader._validate_archive_members(
                        destination, [member.name for member in source.getmembers()]
                    )
                    LOGGER.info("TAR member validation completed: archive=%s", archive)
                    LOGGER.info("TAR extraction started: archive=%s", archive)
                    source.extractall(destination, filter="data")
                    LOGGER.info("TAR extraction completed: archive=%s", archive)
                return
        except (OSError, zipfile.BadZipFile, tarfile.TarError) as error:
            raise DatasetExtractionError(
                f"Unable to extract archive {archive}: {error}"
            ) from error
        raise DatasetExtractionError(
            f"Unsupported or invalid archive format: {archive}. Expected ZIP or TAR."
        )

    @staticmethod
    def _validate_archive_members(destination: Path, members: Sequence[str]) -> None:
        root = destination.resolve()
        for member in members:
            target = (destination / member).resolve()
            if target != root and root not in target.parents:
                raise DatasetExtractionError(
                    f"Archive contains an unsafe path outside the destination: {member}"
                )

    @staticmethod
    def _single_root(directory: Path) -> Path:
        children = list(directory.iterdir())
        if len(children) == 1 and children[0].is_dir():
            return children[0]
        return directory

    @staticmethod
    def _remove_destination(destination: Path) -> None:
        if destination.is_symlink() or destination.is_file():
            destination.unlink()
        elif destination.is_dir():
            shutil.rmtree(destination)

    @staticmethod
    def _write_install_manifest(config: DatasetConfig, archive: Path) -> None:
        manifest = {
            "dataset": config.name,
            "source_type": config.source.type,
            "source": config.source.dataset
            or config.source.url
            or config.source.repo_id,
            "archive": str(archive),
            "installed_at": datetime.now(UTC).isoformat(),
        }
        (config.destination / ".signverse_dataset.json").write_text(
            json.dumps(manifest, indent=2) + "\n",
            encoding="utf-8",
        )

    def _load_config(self, path: Path) -> dict[str, DatasetConfig]:
        LOGGER.info("YAML loading started: path=%s", path)
        if _yaml is None:
            raise DatasetConfigurationError(
                "PyYAML is required to read dataset configuration. Install it with "
                "'python -m pip install PyYAML'."
            )
        try:
            LOGGER.info("YAML file read started: path=%s", path)
            raw = _yaml.safe_load(path.read_text(encoding="utf-8"))
            LOGGER.info("YAML file read and parse completed: path=%s", path)
        except FileNotFoundError as error:
            raise DatasetConfigurationError(
                f"Dataset config does not exist: {path}"
            ) from error
        except (OSError, _yaml.YAMLError) as error:
            raise DatasetConfigurationError(
                f"Unable to read dataset config {path}: {error}"
            ) from error
        if not isinstance(raw, dict) or not isinstance(raw.get("datasets"), dict):
            raise DatasetConfigurationError(
                "Dataset config must contain a 'datasets' mapping."
            )

        datasets: dict[str, DatasetConfig] = {}
        LOGGER.info(
            "Dataset configuration parsing started: entries=%d",
            len(raw["datasets"]),
        )
        for name, value in raw["datasets"].items():
            if not isinstance(name, str) or not isinstance(value, dict):
                raise DatasetConfigurationError(
                    "Every dataset entry must be a named mapping."
                )
            normalized = name.strip().casefold()
            datasets[normalized] = self._parse_dataset(normalized, value)
        LOGGER.info(
            "Dataset configuration parsing completed: datasets=%d", len(datasets)
        )
        LOGGER.info("YAML loading completed: path=%s", path)
        return datasets

    def _parse_dataset(self, name: str, raw: Mapping[str, Any]) -> DatasetConfig:
        source_raw = raw.get("source")
        if not isinstance(source_raw, dict):
            raise DatasetConfigurationError(
                f"Dataset '{name}' requires a source mapping."
            )
        source_type = source_raw.get("type")
        if not isinstance(source_type, str) or source_type not in SUPPORTED_SOURCES:
            raise DatasetConfigurationError(
                f"Dataset '{name}' has unsupported source type '{source_type}'."
            )

        destination_value = raw.get("destination", raw.get("path"))
        if not isinstance(destination_value, str) or not destination_value.strip():
            raise DatasetConfigurationError(
                f"Dataset '{name}' requires a destination path."
            )
        archive_name = raw.get("archive_name", f"{name}.zip")
        if not isinstance(archive_name, str) or Path(archive_name).name != archive_name:
            raise DatasetConfigurationError(
                f"Dataset '{name}' archive_name must be a plain filename."
            )

        validation_raw = raw.get("validation", {})
        if not isinstance(validation_raw, dict):
            raise DatasetConfigurationError(
                f"Dataset '{name}' validation must be a mapping."
            )
        extensions = tuple(
            self._normalize_extension(value)
            for value in self._string_list(
                validation_raw.get("allowed_extensions", []),
                f"Dataset '{name}' allowed_extensions",
            )
        )
        required_globs = tuple(
            self._string_list(
                validation_raw.get("required_globs", []),
                f"Dataset '{name}' required_globs",
            )
        )
        min_files = self._non_negative_int(
            validation_raw.get("min_files", 1), f"Dataset '{name}' min_files"
        )
        min_matching = self._non_negative_int(
            validation_raw.get("min_matching_files", 0),
            f"Dataset '{name}' min_matching_files",
        )

        sha256 = raw.get("sha256")
        if sha256 is not None and (
            not isinstance(sha256, str)
            or len(sha256) != 64
            or any(character not in "0123456789abcdefABCDEF" for character in sha256)
        ):
            raise DatasetConfigurationError(
                f"Dataset '{name}' sha256 must be a 64-character hexadecimal digest."
            )

        return DatasetConfig(
            name=name,
            destination=(self.project_root / destination_value).resolve(),
            archive_name=archive_name,
            source=DatasetSource(
                type=source_type,
                url=self._optional_string(source_raw.get("url")),
                dataset=self._optional_string(source_raw.get("dataset")),
                repo_id=self._optional_string(source_raw.get("repo_id")),
                revision=self._optional_string(source_raw.get("revision")) or "main",
                filename=self._optional_string(source_raw.get("filename")),
                repository=self._optional_string(source_raw.get("repository")),
                tag=self._optional_string(source_raw.get("tag")),
                asset=self._optional_string(source_raw.get("asset")),
            ),
            extract=bool(raw.get("extract", True)),
            strip_single_root=bool(raw.get("strip_single_root", True)),
            sha256=sha256,
            validation=ValidationConfig(
                min_files=min_files,
                required_globs=required_globs,
                allowed_extensions=extensions,
                min_matching_files=min_matching,
            ),
        )

    @staticmethod
    def _optional_string(value: object) -> str | None:
        return value if isinstance(value, str) and value else None

    @staticmethod
    def _string_list(value: object, label: str) -> list[str]:
        if not isinstance(value, list) or not all(
            isinstance(item, str) for item in value
        ):
            raise DatasetConfigurationError(f"{label} must be a list of strings.")
        return value

    @staticmethod
    def _normalize_extension(value: str) -> str:
        normalized = value.casefold()
        return normalized if normalized.startswith(".") else f".{normalized}"

    @staticmethod
    def _non_negative_int(value: object, label: str) -> int:
        if not isinstance(value, int) or isinstance(value, bool) or value < 0:
            raise DatasetConfigurationError(f"{label} must be a non-negative integer.")
        return value


def build_parser() -> argparse.ArgumentParser:
    """Build the command-line parser."""
    parser = argparse.ArgumentParser(
        description="Download and validate raw SignVerse datasets."
    )
    parser.add_argument("dataset", nargs="?", help="Configured dataset name")
    parser.add_argument(
        "--config",
        type=Path,
        default=DEFAULT_CONFIG,
        help="Dataset YAML configuration (default: configs/datasets.yaml)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Replace an existing destination after downloading the archive",
    )
    parser.add_argument(
        "--list",
        action="store_true",
        help="List configured dataset names without downloading",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    """Run the dataset downloader command-line interface."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    LOGGER.info("main() started")
    LOGGER.info("Argument parsing started: argv=%s", list(argv) if argv else "sys.argv")
    arguments = build_parser().parse_args(argv)
    LOGGER.info(
        "Argument parsing completed: dataset=%s config=%s force=%s list=%s",
        arguments.dataset,
        arguments.config,
        arguments.force,
        arguments.list,
    )
    try:
        LOGGER.info("Downloader construction started")
        downloader = DatasetDownloader(arguments.config)
        LOGGER.info("Downloader construction completed")
        if arguments.list:
            LOGGER.info("Dataset listing started")
            print("\n".join(downloader.available_datasets()))
            LOGGER.info("Dataset listing completed")
            LOGGER.info("main() completed: status=0")
            return 0
        if not arguments.dataset:
            raise DatasetConfigurationError(
                "A dataset name is required unless --list is used."
            )
        LOGGER.info("Download dispatch started: dataset=%s", arguments.dataset)
        result = downloader.download(arguments.dataset, force=arguments.force)
        LOGGER.info("Download dispatch completed: dataset=%s", arguments.dataset)
        action = "Installed" if result.downloaded else "Already installed"
        print(f"{action} '{result.name}' at {result.destination}")
        LOGGER.info("main() completed: status=0")
        return 0
    except DatasetDownloadError as error:
        LOGGER.info(
            "main() completed: status=1 error_type=%s error=%s",
            type(error).__name__,
            error,
        )
        print(f"Dataset download failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
