#!/usr/bin/env python3
import argparse
from pathlib import Path

from signverse_api.evaluation.io import load_benchmark, load_predictions, write_json
from signverse_api.evaluation.metrics import evaluate_predictions
from signverse_api.services.playback import SignAssetRegistry


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Evaluate captured SignVerse predictions against the governed benchmark."
    )
    parser.add_argument(
        "predictions", type=Path, help="Prediction JSONL exported by an eval run"
    )
    parser.add_argument(
        "--benchmark",
        type=Path,
        default=Path("benchmarks/interpretation_quality.jsonl"),
    )
    parser.add_argument("--output", type=Path, default=Path("evaluation-results.json"))
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    registry = SignAssetRegistry()
    report = evaluate_predictions(
        load_benchmark(args.benchmark),
        load_predictions(args.predictions),
        asset_lookup=lambda gloss: registry.lookup_gloss(gloss) is not None,
    )
    write_json(args.output, report)
    print(report.model_dump_json(indent=2))
    return 0 if not report.missing_prediction_ids else 2


if __name__ == "__main__":
    raise SystemExit(main())
