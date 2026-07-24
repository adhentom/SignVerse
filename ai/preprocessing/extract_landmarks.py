"""Batch conversion of installed dataset videos into landmark sequences."""

from __future__ import annotations

import argparse
import json
import logging
import sys
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import (
    Callable,
    Iterable,
    Iterator,
    Literal,
    Protocol,
    Sequence,
    TypeVar,
    cast,
)

import numpy as np
from numpy.typing import NDArray

from ai.datasets.schema import Split, load_manifest
from .landmark_schema import DEFAULT_LANDMARK_SCHEMA, LandmarkSchema
from .mediapipe_pipeline import (
    MediaPipeConfig,
    MediaPipeLandmarkPipeline,
    MediaPipePipelineError,
)
from .video_reader import VideoMetadata, VideoReadError, VideoReader

LOGGER = logging.getLogger("signverse.preprocessing")
DEFAULT_NORMALIZED_ROOT = Path("data/normalized")
DEFAULT_OUTPUT_ROOT = Path("data/landmarks")

T = TypeVar("T")


class LandmarkPipeline(Protocol):
    """Frame processor required by :func:`process_video`."""

    schema: LandmarkSchema

    def process(self, bgr_frame: NDArray[np.uint8]) -> NDArray[np.float32]:
        """Convert one BGR frame into a fixed landmark vector."""


class Reader(Protocol):
    """Context-managed video reader required by :func:`process_video`."""

    metadata: VideoMetadata

    def __enter__(self) -> Reader:
        """Enter the reader context."""

    def __exit__(self, *_args: object) -> None:
        """Exit the reader context."""

    def frames(self) -> Iterator[tuple[int, NDArray[np.uint8]]]:
        """Yield indexed BGR frames."""


ReaderFactory = Callable[[Path], Reader]


@dataclass(frozen=True, slots=True)
class VideoJob:
    """One source video and its deterministic output locations."""

    sample_id: str
    dataset: str
    label: str
    split: Split
    source: Path
    landmark_path: Path
    metadata_path: Path


@dataclass(frozen=True, slots=True)
class PreprocessResult:
    """Outcome of processing or skipping one video."""

    source: Path
    status: Literal["processed", "skipped", "failed"]
    landmark_path: Path
    metadata_path: Path
    frames: int = 0
    error: str | None = None


def discover_jobs(
    normalized_root: str | Path = DEFAULT_NORMALIZED_ROOT,
    dataset: str | None = None,
    output_root: str | Path = DEFAULT_OUTPUT_ROOT,
) -> list[VideoJob]:
    """Create canonical preprocessing jobs from the normalized manifest.

    The normalized manifest is authoritative for source video paths, canonical
    sample IDs, labels, datasets, and splits. When ``dataset`` is supplied,
    annotations are filtered case-insensitively by their dataset name.
    """
    normalized = Path(normalized_root).expanduser().resolve()
    manifest = load_manifest(normalized / "annotations.json")
    selected_dataset = dataset.strip().casefold() if dataset else None
    annotations = [
        annotation
        for annotation in manifest.annotations
        if selected_dataset is None or annotation.dataset.casefold() == selected_dataset
    ]
    if not annotations:
        selection = f" for dataset '{dataset}'" if dataset else ""
        raise VideoReadError(
            f"Normalized manifest contains no videos{selection}: "
            f"{normalized / 'annotations.json'}"
        )
    destination = Path(output_root).expanduser().resolve()
    jobs: list[VideoJob] = []
    for annotation in annotations:
        source = normalized / Path(annotation.video)
        output_base = destination / annotation.id
        jobs.append(
            VideoJob(
                sample_id=annotation.id,
                dataset=annotation.dataset,
                label=annotation.label,
                split=annotation.split,
                source=source,
                landmark_path=output_base.with_suffix(".npy"),
                metadata_path=output_base.with_suffix(".json"),
            )
        )
    return jobs


def process_video(
    job: VideoJob,
    pipeline: LandmarkPipeline,
    *,
    overwrite: bool = False,
    reader_factory: ReaderFactory = VideoReader,
) -> PreprocessResult:
    """Convert one video to an atomic ``.npy`` sequence and JSON metadata."""
    if not overwrite and _output_is_current(job):
        return PreprocessResult(
            source=job.source,
            status="skipped",
            landmark_path=job.landmark_path,
            metadata_path=job.metadata_path,
        )

    job.landmark_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with reader_factory(job.source) as reader:
            vectors = [pipeline.process(frame) for _, frame in reader.frames()]
            video_metadata = reader.metadata
        if not vectors:
            raise VideoReadError(f"Video contains no decodable frames: {job.source}")
        sequence = np.stack(vectors).astype(np.float32, copy=False)
        vector_size = int(sequence.shape[1])
        _write_outputs(job, sequence, video_metadata, vector_size)
        return PreprocessResult(
            source=job.source,
            status="processed",
            landmark_path=job.landmark_path,
            metadata_path=job.metadata_path,
            frames=len(vectors),
        )
    except (OSError, ValueError, VideoReadError, MediaPipePipelineError) as error:
        LOGGER.error("Failed to preprocess %s: %s", job.source, error)
        return PreprocessResult(
            source=job.source,
            status="failed",
            landmark_path=job.landmark_path,
            metadata_path=job.metadata_path,
            error=str(error),
        )


def preprocess_dataset(
    dataset: str | None = None,
    *,
    normalized_root: str | Path = DEFAULT_NORMALIZED_ROOT,
    output_root: str | Path = DEFAULT_OUTPUT_ROOT,
    mediapipe_config: MediaPipeConfig | None = None,
    overwrite: bool = False,
    show_progress: bool = True,
    fail_fast: bool = False,
    workers: int = 1,
) -> list[PreprocessResult]:
    """Batch preprocess normalized videos, optionally filtered by dataset."""
    if workers <= 0:
        raise ValueError("workers must be positive.")
    if fail_fast and workers != 1:
        raise ValueError("fail_fast requires workers=1.")
    jobs = discover_jobs(normalized_root, dataset, output_root)
    description = dataset or "normalized dataset"
    if workers == 1:
        results: list[PreprocessResult] = []
        with MediaPipeLandmarkPipeline(mediapipe_config) as pipeline:
            for job in _progress(jobs, enabled=show_progress, description=description):
                result = process_video(job, pipeline, overwrite=overwrite)
                results.append(result)
                if fail_fast and result.status == "failed":
                    break
        return results

    batches = [jobs[index::workers] for index in range(workers)]
    active_batches = [batch for batch in batches if batch]
    LOGGER.info(
        "Parallel preprocessing started: jobs=%d workers=%d",
        len(jobs),
        len(active_batches),
    )
    with ThreadPoolExecutor(max_workers=len(active_batches)) as executor:
        batch_results = executor.map(
            lambda batch: _process_batch(
                batch,
                mediapipe_config=mediapipe_config,
                overwrite=overwrite,
            ),
            active_batches,
        )
        results = [
            result
            for batch in _progress(
                batch_results,
                enabled=show_progress,
                description=description,
            )
            for result in batch
        ]
    LOGGER.info("Parallel preprocessing completed: results=%d", len(results))
    return results


def _process_batch(
    jobs: Sequence[VideoJob],
    *,
    mediapipe_config: MediaPipeConfig | None,
    overwrite: bool,
) -> list[PreprocessResult]:
    """Process one worker batch with a dedicated MediaPipe graph."""
    results: list[PreprocessResult] = []
    with MediaPipeLandmarkPipeline(mediapipe_config) as pipeline:
        for job in jobs:
            results.append(process_video(job, pipeline, overwrite=overwrite))
    return results


def _write_outputs(
    job: VideoJob,
    sequence: NDArray[np.float32],
    video: VideoMetadata,
    vector_size: int,
) -> None:
    source_stat = job.source.stat()
    landmark_temp = job.landmark_path.with_name(f".{job.landmark_path.name}.tmp")
    metadata_temp = job.metadata_path.with_name(f".{job.metadata_path.name}.tmp")
    metadata = {
        "id": job.sample_id,
        "dataset": job.dataset,
        "label": job.label,
        "split": job.split,
        "fps": video.fps,
        "frames": int(sequence.shape[0]),
        "duration": int(sequence.shape[0]) / video.fps,
        "width": video.width,
        "height": video.height,
        "total_frames": video.total_frames,
        "source": str(job.source),
        "source_size": source_stat.st_size,
        "source_mtime_ns": source_stat.st_mtime_ns,
        "landmark_schema": asdict(DEFAULT_LANDMARK_SCHEMA),
        "landmark_vector_size": vector_size,
        "dtype": "float32",
    }
    try:
        with landmark_temp.open("wb") as output:
            np.save(output, sequence, allow_pickle=False)
        metadata_temp.write_text(
            json.dumps(metadata, indent=2) + "\n", encoding="utf-8"
        )
        landmark_temp.replace(job.landmark_path)
        metadata_temp.replace(job.metadata_path)
    finally:
        landmark_temp.unlink(missing_ok=True)
        metadata_temp.unlink(missing_ok=True)


def _output_is_current(job: VideoJob) -> bool:
    if not job.landmark_path.is_file() or not job.metadata_path.is_file():
        return False
    try:
        metadata = json.loads(job.metadata_path.read_text(encoding="utf-8"))
        if not isinstance(metadata, dict):
            return False
        source_stat = job.source.stat()
        if (
            metadata.get("source_size") != source_stat.st_size
            or metadata.get("source_mtime_ns") != source_stat.st_mtime_ns
        ):
            return False
        sequence = np.load(job.landmark_path, mmap_mode="r", allow_pickle=False)
        return bool(
            sequence.ndim == 2
            and sequence.shape[0] == metadata.get("frames")
            and sequence.shape[1] == DEFAULT_LANDMARK_SCHEMA.vector_size
            and sequence.dtype == np.float32
        )
    except (OSError, ValueError, json.JSONDecodeError):
        return False


def _progress(
    values: Iterable[T],
    *,
    enabled: bool,
    description: str,
) -> Iterable[T]:
    if not enabled:
        return values
    try:
        from tqdm import tqdm  # type: ignore[import-untyped]
    except ImportError:
        LOGGER.warning("tqdm is unavailable; continuing without a progress bar.")
        return values
    return cast(
        Iterable[T], tqdm(values, desc=f"Preprocessing {description}", unit="video")
    )


def build_parser() -> argparse.ArgumentParser:
    """Build the preprocessing command-line parser."""
    parser = argparse.ArgumentParser(
        description="Convert normalized ISL videos to MediaPipe landmark sequences."
    )
    parser.add_argument(
        "dataset",
        nargs="?",
        help="Optional normalized dataset name; omit to process every annotation",
    )
    parser.add_argument(
        "--normalized-root",
        type=Path,
        default=DEFAULT_NORMALIZED_ROOT,
        help="Directory containing annotations.json and normalized videos",
    )
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_ROOT)
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument("--holistic", action="store_true")
    parser.add_argument("--input-is-mirrored", action="store_true")
    parser.add_argument(
        "--workers",
        type=int,
        default=1,
        help="Parallel MediaPipe workers (default: 1)",
    )
    parser.add_argument("--no-progress", action="store_true")
    parser.add_argument("--fail-fast", action="store_true")
    parser.add_argument("--log-level", default="INFO")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    """Run batch preprocessing from the command line."""
    arguments = build_parser().parse_args(argv)
    logging.basicConfig(
        level=getattr(logging, str(arguments.log_level).upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    try:
        results = preprocess_dataset(
            arguments.dataset,
            normalized_root=arguments.normalized_root,
            output_root=arguments.output,
            mediapipe_config=MediaPipeConfig(
                use_holistic=arguments.holistic,
                input_is_mirrored=arguments.input_is_mirrored,
            ),
            overwrite=arguments.overwrite,
            show_progress=not arguments.no_progress,
            fail_fast=arguments.fail_fast,
            workers=arguments.workers,
        )
    except Exception as error:
        LOGGER.error("Preprocessing could not start: %s", error)
        return 1

    processed = sum(result.status == "processed" for result in results)
    skipped = sum(result.status == "skipped" for result in results)
    failed = sum(result.status == "failed" for result in results)
    print(f"Processed: {processed}; skipped: {skipped}; failed: {failed}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
