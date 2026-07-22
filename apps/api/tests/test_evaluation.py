from pathlib import Path

import pytest

from signverse_api.evaluation.io import load_benchmark
from signverse_api.evaluation.metrics import evaluate_predictions
from signverse_api.evaluation.models import (
    BenchmarkCase,
    BenchmarkPrediction,
    SemanticExpectation,
)

BENCHMARK_PATH = Path(__file__).parents[3] / "benchmarks" / "interpretation_quality.jsonl"


def prediction_for_case(index: int = 0) -> tuple[list[BenchmarkCase], BenchmarkPrediction]:
    cases = load_benchmark(BENCHMARK_PATH)
    case = cases[index]
    prediction = BenchmarkPrediction(
        id=case.id,
        semantics=case.expected_semantics,
        malayalam_translation=case.expected_malayalam_translation,
        isl_gloss=case.expected_isl_gloss,
        latency_ms=120.0,
        avatar_continuity=0.96,
    )
    return cases, prediction


def test_benchmark_has_200_unique_representative_candidate_cases() -> None:
    cases = load_benchmark(BENCHMARK_PATH)

    assert len(cases) == 200
    assert len({case.id for case in cases}) == 200
    assert len({case.source for case in cases}) == 200
    assert {case.category for case in cases} == {
        "greetings",
        "conversation",
        "education",
        "technical",
        "questions",
        "commands",
        "negation",
        "emotion",
        "idioms",
        "live-captions",
    }
    assert all(case.expected_malayalam_translation for case in cases)
    assert all(case.expected_isl_gloss for case in cases)
    assert all(case.review_status == "candidate-native-review-required" for case in cases)


def test_reference_prediction_scores_perfect_semantics_translation_and_gloss() -> None:
    cases, prediction = prediction_for_case()

    report = evaluate_predictions(
        cases[:1],
        [prediction],
        asset_lookup=lambda gloss: gloss == "WELCOME",
    )

    assert report.semantic_accuracy == 1.0
    assert report.translation_similarity == 1.0
    assert report.gloss_correctness == pytest.approx(1.0)
    assert report.exact_gloss_rate == 1.0
    assert report.asset_coverage == 1 / 3
    assert report.animation_readiness == 1 / 3
    assert report.avatar_continuity == 0.96
    assert report.latency_mean_ms == 120.0
    assert report.latency_p95_ms == 120.0
    assert report.native_reviewed_cases == 0


def test_evaluation_detects_semantic_translation_and_gloss_regressions() -> None:
    cases, reference = prediction_for_case()
    regression = reference.model_copy(
        update={
            "semantics": SemanticExpectation(
                intent="unrelated intent",
                speech_act="command",
                tense="past",
                aspect=["completed"],
                modality=["obligation"],
                polarity="negative",
                emotion="angry",
                voice="passive",
            ),
            "malayalam_translation": "English only output",
            "isl_gloss": ["UNRELATED"],
        }
    )

    report = evaluate_predictions(cases[:1], [regression])

    assert report.semantic_accuracy < 0.2
    assert report.translation_similarity < 0.2
    assert report.malayalam_fluency_proxy == 0.0
    assert report.gloss_correctness < 0.2
    assert report.exact_gloss_rate == 0.0


def test_evaluation_reports_missing_predictions() -> None:
    cases = load_benchmark(BENCHMARK_PATH)[:2]

    report = evaluate_predictions(cases, [])

    assert report.evaluated_cases == 0
    assert report.missing_prediction_ids == [case.id for case in cases]
