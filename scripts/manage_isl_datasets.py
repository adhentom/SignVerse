#!/usr/bin/env python3
"""Analyze and promote governed ISL datasets without network access."""

from __future__ import annotations

import argparse
from dataclasses import asdict
from pathlib import Path

from signverse_datasets import DatasetPipeline


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repository", type=Path, default=Path.cwd())
    parser.add_argument("--config", type=Path, default=Path("config/isl_datasets.json"))
    subcommands = parser.add_subparsers(dest="command", required=True)
    analyze = subcommands.add_parser("analyze")
    analyze.add_argument("--dry-run", action="store_true")
    promote = subcommands.add_parser("promote")
    promote.add_argument("source_id")
    promote.add_argument("--convert", action="store_true")
    arguments = parser.parse_args()
    repository = arguments.repository.resolve()
    config = arguments.config
    config = config if config.is_absolute() else repository / config
    pipeline = DatasetPipeline(repository, config)
    if arguments.command == "analyze":
        result = pipeline.run(write=not arguments.dry_run)
        print(asdict(result))
    else:
        count = pipeline.promote(arguments.source_id, convert=arguments.convert)
        print(f"Promoted {count} governed assets")


if __name__ == "__main__":
    main()
