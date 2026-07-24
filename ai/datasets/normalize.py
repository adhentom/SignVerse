"""Normalize heterogeneous installed ISL datasets into one video schema."""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
import shutil
import subprocess
import tempfile
from collections import defaultdict
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Callable, Iterable, Literal, Protocol, Sequence, TypeVar, cast

from src.dataset import BaseDatasetAdapter, DatasetManager

from ai.preprocessing.video_reader import VideoMetadata, VideoReadError, VideoReader

from .schema import (
    VALID_SPLITS,
    CanonicalAnnotation,
    DatasetSchemaError,
    DatasetStatistics,
    NormalizedDatasetManifest,
    Resolution,
    Split,
)

LOGGER = logging.getLogger("signverse.datasets.normalize")
SUPPORTED_DATASETS = frozenset({"isl-csltr", "cislr", "include", "nish", "mudra"})
DEFAULT_CONFIG = Path("configs/datasets.yaml")
DEFAULT_OUTPUT = Path("data/normalized")
T = TypeVar("T")


class DatasetNormalizationError(RuntimeError):
    """Raised when source discovery, conversion, or validation fails."""


class NormalizableAdapter(Protocol):
    """Dataset adapter capabilities required by this normalization phase."""

    root: Path

    def scan(self) -> list[Path]:
        """Return installed source videos."""

    def label_for(self, video: Path) -> str:
        """Return the source label for a video."""

    def split_for(self, video: Path) -> str | None:
        """Return an existing source split when one is encoded in its path."""


@dataclass(frozen=True, slots=True)
class SplitRatios:
    """Target ratios used for samples without a source-defined split."""

    train: float = 0.8
    validation: float = 0.1
    test: float = 0.1

    def __post_init__(self) -> None:
        """Require non-negative ratios that sum to one."""
        values = (self.train, self.validation, self.test)
        if any(value < 0 for value in values):
            raise ValueError("Split ratios must be non-negative.")
        if abs(sum(values) - 1.0) > 1e-9:
            raise ValueError("Split ratios must sum to 1.0.")


@dataclass(frozen=True, slots=True)
class NormalizationConfig:
    """Filesystem, splitting, and conversion behavior for normalization."""

    output_root: Path = DEFAULT_OUTPUT
    split_ratios: SplitRatios = SplitRatios()
    seed: int = 42
    copy_mode: Literal["copy", "hardlink"] = "hardlink"
    overwrite: bool = False
    show_progress: bool = True

    def __post_init__(self) -> None:
        """Validate the selected materialization mode."""
        if self.copy_mode not in {"copy", "hardlink"}:
            raise ValueError("copy_mode must be 'copy' or 'hardlink'.")


@dataclass(frozen=True, slots=True)
class SourceSample:
    """Adapter-derived source video before canonical id assignment."""

    dataset: str
    video: Path
    label: str
    source_split: Split | None


VideoProbe = Callable[[Path], VideoMetadata]


def probe_video(path: Path) -> VideoMetadata:
    """Decode a video completely and return validated OpenCV metadata."""
    with VideoReader(path) as reader:
        decoded_frames = sum(1 for _ in reader.frames())
        metadata = reader.metadata
    if decoded_frames <= 0:
        raise VideoReadError(f"Video contains no decodable frames: {path}")
    return replace(
        metadata,
        total_frames=decoded_frames,
        duration=decoded_frames / metadata.fps,
    )


def normalize_datasets(
    manager: DatasetManager,
    datasets: Sequence[str],
    config: NormalizationConfig | None = None,
    *,
    video_probe: VideoProbe = probe_video,
) -> NormalizedDatasetManifest:
    """Normalize installed datasets into ``videos/`` and ``annotations.json``.

    MP4 sources are copied or hard-linked. AVI and MOV inputs are transcoded to
    MP4 with ffmpeg so a file extension is never changed without changing its
    actual container.
    """
    settings = config or NormalizationConfig()
    output_root = settings.output_root.expanduser().resolve()
    _validate_output_root(output_root)
    if output_root.exists() and not settings.overwrite:
        raise DatasetNormalizationError(
            f"Normalized destination already exists: {output_root}. "
            "Use --overwrite to replace it."
        )
    selected = _normalize_dataset_names(datasets)
    sources = _discover_sources(manager, selected)
    assigned = _assign_splits(sources, settings.split_ratios, settings.seed)

    output_root.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(
        tempfile.mkdtemp(prefix=f".{output_root.name}-staging-", dir=output_root.parent)
    )
    try:
        videos_root = staging / "videos"
        videos_root.mkdir()
        annotations: list[CanonicalAnnotation] = []
        for index, (source, split) in enumerate(
            _progress(
                assigned,
                enabled=settings.show_progress,
                description="Normalizing videos",
            ),
            start=1,
        ):
            sample_id = f"{index:06d}"
            target = videos_root / f"{sample_id}.mp4"
            _materialize_video(source.video, target, settings.copy_mode)
            metadata = video_probe(target)
            annotation = CanonicalAnnotation(
                id=sample_id,
                video=target.relative_to(staging).as_posix(),
                label=source.label,
                dataset=source.dataset,
                split=split,
                fps=metadata.fps,
                duration=metadata.duration,
                resolution=Resolution(metadata.width, metadata.height),
            )
            annotation.validate(staging)
            annotations.append(annotation)

        statistics = DatasetStatistics.from_annotations(annotations)
        manifest = NormalizedDatasetManifest(tuple(annotations), statistics)
        manifest.write(staging / "annotations.json")
        (staging / "statistics.json").write_text(
            json.dumps(statistics.to_dict(), indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        _publish_staging(staging, output_root, overwrite=settings.overwrite)
        published = NormalizedDatasetManifest(tuple(annotations), statistics)
        published.validate(output_root)
        return published
    except Exception:
        shutil.rmtree(staging, ignore_errors=True)
        raise


def _discover_sources(
    manager: DatasetManager, datasets: Sequence[str]
) -> list[SourceSample]:
    sources: list[SourceSample] = []
    seen_paths: set[Path] = set()
    for dataset in datasets:
        adapter = manager.get_adapter(dataset)
        normalizable = _normalizable_adapter(adapter, dataset)
        videos = normalizable.scan()
        if not videos:
            raise DatasetNormalizationError(
                f"Installed dataset '{dataset}' contains no supported videos."
            )
        for video in videos:
            resolved = video.resolve()
            if resolved in seen_paths:
                raise DatasetNormalizationError(
                    f"Source video is registered more than once: {resolved}"
                )
            seen_paths.add(resolved)
            raw_split = normalizable.split_for(video)
            split = cast(Split, raw_split) if raw_split in VALID_SPLITS else None
            label = normalizable.label_for(video).strip()
            if not label:
                raise DatasetNormalizationError(
                    f"Source video has an empty label: {video}"
                )
            sources.append(SourceSample(dataset, resolved, label, split))
    return sorted(
        sources,
        key=lambda sample: (
            sample.dataset,
            sample.label.casefold(),
            sample.video.as_posix(),
        ),
    )


def _assign_splits(
    sources: Sequence[SourceSample], ratios: SplitRatios, seed: int
) -> list[tuple[SourceSample, Split]]:
    assigned: dict[Path, Split] = {
        sample.video: sample.source_split
        for sample in sources
        if sample.source_split is not None
    }
    by_label: dict[str, list[SourceSample]] = defaultdict(list)
    for sample in sources:
        if sample.source_split is None:
            by_label[sample.label.casefold()].append(sample)

    for label, samples in sorted(by_label.items()):
        ordered = sorted(
            samples,
            key=lambda sample: _stable_key(seed, label, sample.video.as_posix()),
        )
        train_count, validation_count, _ = _split_counts(len(ordered), ratios)
        for index, sample in enumerate(ordered):
            if index < train_count:
                split: Split = "train"
            elif index < train_count + validation_count:
                split = "validation"
            else:
                split = "test"
            assigned[sample.video] = split
    return [(sample, assigned[sample.video]) for sample in sources]


def _split_counts(total: int, ratios: SplitRatios) -> tuple[int, int, int]:
    if total <= 0:
        return 0, 0, 0
    if total == 1:
        return 1, 0, 0
    if total == 2:
        return 1, 0, 1
    validation = max(1, round(total * ratios.validation))
    test = max(1, round(total * ratios.test))
    if validation + test >= total:
        validation = 1
        test = 1
    train = total - validation - test
    return train, validation, test


def _stable_key(seed: int, label: str, path: str) -> str:
    return hashlib.sha256(f"{seed}\0{label}\0{path}".encode()).hexdigest()


def _materialize_video(
    source: Path, target: Path, copy_mode: Literal["copy", "hardlink"]
) -> None:
    if source.suffix.casefold() == ".mp4":
        if copy_mode == "hardlink":
            try:
                os.link(source, target)
                return
            except OSError:
                LOGGER.info("Hard link unavailable for %s; copying instead.", source)
        shutil.copy2(source, target)
        return
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg is None:
        raise DatasetNormalizationError(
            f"ffmpeg is required to convert {source.suffix} input to canonical MP4: {source}"
        )
    command = [
        ffmpeg,
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        str(source),
        "-map",
        "0:v:0",
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "18",
        "-movflags",
        "+faststart",
        str(target),
    ]
    try:
        subprocess.run(command, check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as error:
        message = error.stderr.strip() or str(error)
        raise DatasetNormalizationError(
            f"ffmpeg failed to convert {source}: {message}"
        ) from error


def _publish_staging(staging: Path, destination: Path, *, overwrite: bool) -> None:
    if destination.exists() and not overwrite:
        raise DatasetNormalizationError(
            f"Normalized destination already exists: {destination}. Use --overwrite to replace it."
        )
    backup = destination.with_name(f".{destination.name}-backup")
    if backup.exists():
        raise DatasetNormalizationError(f"Stale normalization backup exists: {backup}")
    try:
        if destination.exists():
            destination.replace(backup)
        staging.replace(destination)
        shutil.rmtree(backup, ignore_errors=True)
    except Exception:
        if not destination.exists() and backup.exists():
            backup.replace(destination)
        raise


def _validate_output_root(destination: Path) -> None:
    forbidden = {Path("/").resolve(), Path.home().resolve(), Path.cwd().resolve()}
    if destination in forbidden or destination.parent == destination:
        raise DatasetNormalizationError(
            f"Refusing to use a broad normalization destination: {destination}"
        )


def _normalizable_adapter(
    adapter: BaseDatasetAdapter, dataset: str
) -> NormalizableAdapter:
    if not callable(getattr(adapter, "label_for", None)) or not callable(
        getattr(adapter, "split_for", None)
    ):
        raise DatasetNormalizationError(
            f"Dataset adapter for '{dataset}' does not support normalization."
        )
    return cast(NormalizableAdapter, adapter)


def _normalize_dataset_names(datasets: Sequence[str]) -> tuple[str, ...]:
    names = tuple(
        dict.fromkeys(name.strip().casefold() for name in datasets if name.strip())
    )
    if not names:
        raise DatasetNormalizationError("At least one dataset must be selected.")
    unsupported = sorted(set(names) - SUPPORTED_DATASETS)
    if unsupported:
        raise DatasetNormalizationError(
            "Unsupported datasets: "
            + ", ".join(unsupported)
            + ". Supported datasets: "
            + ", ".join(sorted(SUPPORTED_DATASETS))
            + "."
        )
    return names


def _progress(values: Iterable[T], *, enabled: bool, description: str) -> Iterable[T]:
    if not enabled:
        return values
    try:
        from tqdm import tqdm  # type: ignore[import-untyped]
    except ImportError:
        LOGGER.warning("tqdm is unavailable; continuing without a progress bar.")
        return values
    return cast(Iterable[T], tqdm(values, desc=description, unit="video"))


def build_parser() -> argparse.ArgumentParser:
    """Build the dataset normalization command-line parser."""
    parser = argparse.ArgumentParser(
        description="Normalize installed ISL datasets into one canonical format."
    )
    parser.add_argument(
        "datasets",
        nargs="*",
        help="Datasets to normalize; defaults to all installed supported datasets",
    )
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--copy-mode", choices=("copy", "hardlink"), default="hardlink")
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument("--no-progress", action="store_true")
    parser.add_argument("--log-level", default="INFO")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    """Run canonical dataset normalization from the command line."""
    arguments = build_parser().parse_args(argv)
    logging.basicConfig(
        level=getattr(logging, str(arguments.log_level).upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    try:
        manager = DatasetManager.from_config(arguments.config)
        selected = arguments.datasets or [
            registration.name
            for registration in manager.list_installed_datasets()
            if registration.name in SUPPORTED_DATASETS
        ]
        manifest = normalize_datasets(
            manager,
            selected,
            NormalizationConfig(
                output_root=arguments.output,
                seed=arguments.seed,
                copy_mode=arguments.copy_mode,
                overwrite=arguments.overwrite,
                show_progress=not arguments.no_progress,
            ),
        )
    except (
        DatasetNormalizationError,
        DatasetSchemaError,
        VideoReadError,
        OSError,
    ) as error:
        LOGGER.error("Normalization failed: %s", error)
        return 1
    print(
        f"Normalized {manifest.statistics.total_samples} videos into "
        f"{Path(arguments.output).resolve()}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
