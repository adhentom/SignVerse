import json
from pathlib import Path

from pydantic import BaseModel

from signverse_api.evaluation.models import BenchmarkCase, BenchmarkPrediction


def _load_jsonl[ModelT: BaseModel](path: Path, model: type[ModelT]) -> list[ModelT]:
    values: list[ModelT] = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        try:
            values.append(model.model_validate_json(line))
        except ValueError as error:
            raise ValueError(f"Invalid benchmark record at {path}:{line_number}") from error
    return values


def load_benchmark(path: Path) -> list[BenchmarkCase]:
    return _load_jsonl(path, BenchmarkCase)


def load_predictions(path: Path) -> list[BenchmarkPrediction]:
    return _load_jsonl(path, BenchmarkPrediction)


def write_json(path: Path, value: BaseModel) -> None:
    path.write_text(
        json.dumps(value.model_dump(mode="json"), indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
