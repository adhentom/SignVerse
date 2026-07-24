"""Unit tests for the raw dataset downloader."""

from __future__ import annotations

import builtins
import sys
from contextlib import redirect_stdout
from io import BytesIO
from io import StringIO
import tempfile
from types import ModuleType
import unittest
import zipfile
from pathlib import Path
from typing import Any
from unittest.mock import patch

from ai.download_dataset import (
    DatasetAuthenticationError,
    DatasetConfigurationError,
    DatasetDownloader,
    DatasetExtractionError,
    DatasetValidationError,
    DownloadRequest,
    main,
)


class DatasetDownloaderTests(unittest.TestCase):
    """Exercise configuration, extraction, validation, and provider errors."""

    def setUp(self) -> None:
        """Create an isolated project-like directory."""
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        (self.root / "configs").mkdir()

    def tearDown(self) -> None:
        """Remove temporary test contents."""
        self.temporary.cleanup()

    def write_config(self, body: str) -> Path:
        """Write and return a temporary dataset YAML configuration."""
        path = self.root / "configs" / "datasets.yaml"
        path.write_text(body, encoding="utf-8")
        return path

    def test_extracts_and_validates_manual_zip(self) -> None:
        """A downloaded archive is safely extracted and validated."""
        config = self.write_config(
            """
datasets:
  sample:
    destination: data/sample
    archive_name: sample.zip
    source:
      type: manual_url
      url: https://example.invalid/sample.zip
    validation:
      min_files: 1
      allowed_extensions: [.mp4]
      min_matching_files: 1
"""
        )
        source_archive = self.root / "source.zip"
        with zipfile.ZipFile(source_archive, "w") as archive:
            archive.writestr("sample/video.mp4", b"video")

        def copy_download(
            request: DownloadRequest, destination: Path, *, retries: int = 3
        ) -> None:
            del request, retries
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(source_archive.read_bytes())

        with self.assertLogs("signverse.download_dataset", level="INFO") as captured:
            downloader = DatasetDownloader(config)
            with patch.object(
                downloader, "_download_resumable", side_effect=copy_download
            ):
                result = downloader.download("sample")

        self.assertTrue(result.downloaded)
        self.assertTrue((result.destination / "video.mp4").is_file())
        self.assertTrue((result.destination / ".signverse_dataset.json").is_file())
        downloader.validate("sample")
        messages = "\n".join(captured.output)
        for expected in (
            "YAML loading started",
            "Dataset lookup completed",
            "Provider selection completed",
            "Destination path creation completed",
            "Archive download invocation completed",
            "Extraction completed",
            "Dataset validation completed",
            "Dataset download completed",
        ):
            with self.subTest(log=expected):
                self.assertIn(expected, messages)

    def test_rejects_unsafe_zip_member(self) -> None:
        """Archive traversal paths are rejected before extraction."""
        archive_path = self.root / "unsafe.zip"
        with zipfile.ZipFile(archive_path, "w") as archive:
            archive.writestr("../outside.txt", "unsafe")

        with self.assertRaises(DatasetExtractionError):
            DatasetDownloader._extract_archive(archive_path, self.root / "extract")

    def test_resumes_partial_http_download(self) -> None:
        """An existing partial file is continued with an HTTP Range request."""

        class PartialResponse(BytesIO):
            status = 206

            def __enter__(self) -> PartialResponse:
                return self

            def __exit__(self, *_args: object) -> None:
                self.close()

        destination = self.root / "archive.zip"
        destination.with_name("archive.zip.part").write_bytes(b"first-")
        request = DownloadRequest("https://example.invalid/archive.zip", {})

        with (
            self.assertLogs("signverse.download_dataset", level="INFO") as captured,
            patch(
                "ai.download_dataset.urllib.request.urlopen",
                return_value=PartialResponse(b"second"),
            ) as urlopen,
        ):
            DatasetDownloader._download_resumable(request, destination)

        sent_request = urlopen.call_args.args[0]
        self.assertEqual(sent_request.get_header("Range"), "bytes=6-")
        self.assertEqual(destination.read_bytes(), b"first-second")
        messages = "\n".join(captured.output)
        self.assertIn("HTTP request invocation started", messages)
        self.assertIn("HTTP request invocation completed", messages)
        self.assertIn("HTTP response streaming started", messages)
        self.assertIn("HTTP response streaming completed", messages)

    def test_main_logs_cli_parsing_yaml_and_completion(self) -> None:
        """The CLI emits diagnostics before and after non-download major steps."""
        config = self.write_config(
            """
datasets:
  sample:
    destination: data/sample
    source:
      type: manual_url
      url: https://example.invalid/sample.zip
"""
        )
        output = StringIO()

        with (
            self.assertLogs("signverse.download_dataset", level="INFO") as captured,
            patch("ai.download_dataset.logging.basicConfig"),
            redirect_stdout(output),
        ):
            status = main(["--config", str(config), "--list"])

        self.assertEqual(status, 0)
        self.assertEqual(output.getvalue().strip(), "sample")
        messages = "\n".join(captured.output)
        for expected in (
            "main() started",
            "Argument parsing started",
            "Argument parsing completed",
            "YAML loading started",
            "YAML loading completed",
            "main() completed: status=0",
        ):
            with self.subTest(log=expected):
                self.assertIn(expected, messages)

    def test_validation_reports_missing_dataset(self) -> None:
        """Validation emits a clear error for a missing destination."""
        config = self.write_config(
            """
datasets:
  sample:
    destination: data/sample
    source:
      type: manual_url
      url: https://example.invalid/sample.zip
"""
        )
        with self.assertRaisesRegex(DatasetValidationError, "is not installed"):
            DatasetDownloader(config).validate("sample")

    def test_kaggle_api_authenticates_and_downloads_configured_archive(self) -> None:
        """The official API is authenticated and its slug ZIP is normalized."""
        config = self.write_config(
            """
datasets:
  sample:
    destination: data/sample
    archive_name: configured.zip
    source:
      type: kaggle
      dataset: owner/dataset-slug
    validation:
      min_files: 1
      allowed_extensions: [.mp4]
      min_matching_files: 1
"""
        )
        downloader = DatasetDownloader(config)

        class FakeKaggleApi:
            def __init__(self) -> None:
                self.authenticated = False
                self.download_calls: list[dict[str, object]] = []

            def authenticate(self) -> None:
                self.authenticated = True

            def dataset_download_files(
                self,
                dataset: str,
                path: str | None = None,
                force: bool = False,
                quiet: bool = True,
                unzip: bool = False,
            ) -> None:
                self.download_calls.append(
                    {
                        "dataset": dataset,
                        "path": path,
                        "force": force,
                        "quiet": quiet,
                        "unzip": unzip,
                    }
                )
                if path is None:
                    raise AssertionError("Kaggle download path is required")
                with zipfile.ZipFile(Path(path) / "dataset-slug.zip", "w") as archive:
                    archive.writestr("sample/video.mp4", b"video")

        fake_api = FakeKaggleApi()
        with (
            patch.object(
                DatasetDownloader, "_initialize_kaggle_api", return_value=fake_api
            ) as initialize,
            self.assertLogs("signverse.download_dataset", level="INFO") as captured,
        ):
            result = downloader.download("sample")

        initialize.assert_called_once_with()
        self.assertEqual(
            fake_api.download_calls,
            [
                {
                    "dataset": "owner/dataset-slug",
                    "path": str(result.archive.parent),
                    "force": False,
                    "quiet": False,
                    "unzip": False,
                }
            ],
        )
        self.assertEqual(result.archive.name, "configured.zip")
        self.assertTrue(result.archive.is_file())
        self.assertTrue((result.destination / "video.mp4").is_file())
        messages = "\n".join(captured.output)
        self.assertIn("Kaggle download started", messages)
        self.assertIn("Kaggle download completed", messages)
        self.assertIn("Kaggle archive path resolved", messages)
        self.assertIn("Extraction started", messages)
        self.assertIn("Extraction completed", messages)

    def test_kaggle_api_initialization_authenticates(self) -> None:
        """KaggleApi is constructed and authenticate() succeeds explicitly."""

        class FakeKaggleApi:
            instances: list[FakeKaggleApi] = []

            def __init__(self) -> None:
                self.authenticated = False
                self.instances.append(self)

            def authenticate(self) -> None:
                self.authenticated = True

            def dataset_download_files(
                self,
                dataset: str,
                path: str | None = None,
                force: bool = False,
                quiet: bool = True,
                unzip: bool = False,
            ) -> None:
                del dataset, path, force, quiet, unzip

        kaggle_package = ModuleType("kaggle")
        kaggle_api_package = ModuleType("kaggle.api")
        kaggle_extended = ModuleType("kaggle.api.kaggle_api_extended")
        setattr(kaggle_extended, "KaggleApi", FakeKaggleApi)

        with (
            patch.dict(
                sys.modules,
                {
                    "kaggle": kaggle_package,
                    "kaggle.api": kaggle_api_package,
                    "kaggle.api.kaggle_api_extended": kaggle_extended,
                },
            ),
            self.assertLogs("signverse.download_dataset", level="INFO") as captured,
        ):
            api = DatasetDownloader._initialize_kaggle_api()

        self.assertIs(api, FakeKaggleApi.instances[0])
        self.assertTrue(FakeKaggleApi.instances[0].authenticated)
        messages = "\n".join(captured.output)
        self.assertIn("Kaggle API initialization started", messages)
        self.assertIn("Kaggle API initialization completed", messages)
        self.assertIn("Kaggle authentication succeeded", messages)

    def test_missing_kaggle_dependency_has_install_guidance(self) -> None:
        """A missing optional dependency produces the requested install command."""
        original_import = builtins.__import__

        def import_without_kaggle(
            name: str,
            globals: dict[str, Any] | None = None,
            locals: dict[str, Any] | None = None,
            fromlist: tuple[str, ...] = (),
            level: int = 0,
        ) -> Any:
            if name.startswith("kaggle"):
                raise ModuleNotFoundError("No module named 'kaggle'")
            return original_import(name, globals, locals, fromlist, level)

        with (
            patch("builtins.__import__", side_effect=import_without_kaggle),
            self.assertRaisesRegex(DatasetConfigurationError, "pip install kaggle"),
        ):
            DatasetDownloader._initialize_kaggle_api()

    def test_kaggle_download_retries_and_converts_errors(self) -> None:
        """Transient API failures retry while 403 errors become project errors."""

        class RetryApi:
            def __init__(self) -> None:
                self.calls = 0

            def authenticate(self) -> None:
                return

            def dataset_download_files(
                self,
                dataset: str,
                path: str | None = None,
                force: bool = False,
                quiet: bool = True,
                unzip: bool = False,
            ) -> None:
                del force, quiet, unzip
                self.calls += 1
                if self.calls < 3:
                    raise RuntimeError("temporary Kaggle failure")
                if path is None:
                    raise AssertionError("Kaggle download path is required")
                with zipfile.ZipFile(Path(path) / "dataset.zip", "w") as archive:
                    archive.writestr("video.mp4", b"video")

        destination = self.root / "downloads" / "configured.zip"
        destination.parent.mkdir()
        retry_api = RetryApi()
        with (
            patch.object(
                DatasetDownloader,
                "_initialize_kaggle_api",
                return_value=retry_api,
            ),
            patch("ai.download_dataset.time.sleep") as sleep,
        ):
            DatasetDownloader._download_kaggle("owner/dataset", destination)

        self.assertEqual(retry_api.calls, 3)
        self.assertEqual([call.args[0] for call in sleep.call_args_list], [1, 2])
        self.assertTrue(destination.is_file())

        class ForbiddenError(Exception):
            status = 403

        class ForbiddenApi(RetryApi):
            def dataset_download_files(
                self,
                dataset: str,
                path: str | None = None,
                force: bool = False,
                quiet: bool = True,
                unzip: bool = False,
            ) -> None:
                del dataset, path, force, quiet, unzip
                raise ForbiddenError("forbidden")

        with (
            patch.object(
                DatasetDownloader,
                "_initialize_kaggle_api",
                return_value=ForbiddenApi(),
            ),
            self.assertRaisesRegex(
                DatasetAuthenticationError, "rejected authentication"
            ),
        ):
            DatasetDownloader._download_kaggle("owner/dataset", destination)


if __name__ == "__main__":
    unittest.main()
