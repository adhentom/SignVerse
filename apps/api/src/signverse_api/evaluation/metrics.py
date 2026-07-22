import re
from collections import Counter
from collections.abc import Callable, Iterable
from itertools import pairwise

from signverse_api.evaluation.models import (
    BenchmarkCase,
    BenchmarkPrediction,
    EvaluationReport,
    SemanticExpectation,
)

MALAYALAM_START = ord("\u0d00")
MALAYALAM_END = ord("\u0d7f")


def _mean(values: Iterable[float]) -> float:
    materialized = list(values)
    return sum(materialized) / len(materialized) if materialized else 0.0


def _percentile(values: Iterable[float], percentile: float) -> float:
    ordered = sorted(values)
    if not ordered:
        return 0.0
    index = min(len(ordered) - 1, max(0, round((len(ordered) - 1) * percentile)))
    return ordered[index]


def _normalize(value: str) -> str:
    return " ".join(re.findall(r"\w+", value.casefold(), flags=re.UNICODE))


def _f1(expected: Iterable[str], actual: Iterable[str]) -> float:
    expected_counts = Counter(expected)
    actual_counts = Counter(actual)
    overlap = sum((expected_counts & actual_counts).values())
    if not expected_counts and not actual_counts:
        return 1.0
    precision = overlap / sum(actual_counts.values()) if actual_counts else 0.0
    recall = overlap / sum(expected_counts.values()) if expected_counts else 0.0
    return 2 * precision * recall / (precision + recall) if precision + recall else 0.0


def _character_ngrams(value: str, size: int = 3) -> list[str]:
    normalized = _normalize(value)
    if len(normalized) < size:
        return [normalized] if normalized else []
    return [normalized[index : index + size] for index in range(len(normalized) - size + 1)]


def _semantic_score(expected: SemanticExpectation, actual: SemanticExpectation) -> float:
    scalar_fields = ("intent", "speech_act", "tense", "polarity", "emotion", "voice")
    scalar_scores = [
        float(_normalize(getattr(expected, field)) == _normalize(getattr(actual, field)))
        for field in scalar_fields
    ]
    return _mean(
        [
            *scalar_scores,
            _f1(expected.aspect, actual.aspect),
            _f1(expected.modality, actual.modality),
        ]
    )


def _gloss_score(expected: list[str], actual: list[str]) -> float:
    token_f1 = _f1((item.casefold() for item in expected), (item.casefold() for item in actual))
    positional = _mean(
        float(left.casefold() == right.casefold())
        for left, right in zip(expected, actual, strict=False)
    )
    length_score = min(len(expected), len(actual)) / max(len(expected), len(actual), 1)
    return 0.6 * token_f1 + 0.3 * positional + 0.1 * length_score


def _malayalam_fluency_proxy(value: str) -> float:
    letters = [character for character in value if character.isalpha()]
    if not letters:
        return 0.0
    malayalam_ratio = sum(
        MALAYALAM_START <= ord(character) <= MALAYALAM_END for character in letters
    ) / len(letters)
    tokens = value.split()
    repetition_penalty = 0.0
    if len(tokens) >= 4:
        repeated_pairs = sum(left == right for left, right in pairwise(tokens))
        repetition_penalty = min(0.25, repeated_pairs / len(tokens))
    return max(0.0, min(1.0, malayalam_ratio - repetition_penalty))


def evaluate_predictions(
    cases: list[BenchmarkCase],
    predictions: list[BenchmarkPrediction],
    asset_lookup: Callable[[str], bool] | None = None,
) -> EvaluationReport:
    predictions_by_id = {prediction.id: prediction for prediction in predictions}
    pairs = [(case, predictions_by_id[case.id]) for case in cases if case.id in predictions_by_id]
    missing = [case.id for case in cases if case.id not in predictions_by_id]
    expected_glosses = [token for case, _ in pairs for token in case.expected_isl_gloss]
    covered_assets = (
        sum(asset_lookup(token) for token in expected_glosses) if asset_lookup is not None else 0
    )
    asset_coverage = covered_assets / len(expected_glosses) if expected_glosses else 0.0
    latencies = [
        prediction.latency_ms for _, prediction in pairs if prediction.latency_ms is not None
    ]
    continuity = [
        prediction.avatar_continuity
        for _, prediction in pairs
        if prediction.avatar_continuity is not None
    ]
    return EvaluationReport(
        total_cases=len(cases),
        evaluated_cases=len(pairs),
        native_reviewed_cases=sum(case.review_status == "native-reviewed" for case in cases),
        semantic_accuracy=_mean(
            _semantic_score(case.expected_semantics, prediction.semantics)
            for case, prediction in pairs
        ),
        translation_similarity=_mean(
            _f1(
                _character_ngrams(case.expected_malayalam_translation),
                _character_ngrams(prediction.malayalam_translation),
            )
            for case, prediction in pairs
        ),
        malayalam_fluency_proxy=_mean(
            _malayalam_fluency_proxy(prediction.malayalam_translation) for _, prediction in pairs
        ),
        gloss_correctness=_mean(
            _gloss_score(case.expected_isl_gloss, prediction.isl_gloss)
            for case, prediction in pairs
        ),
        exact_gloss_rate=_mean(
            float(
                [token.casefold() for token in case.expected_isl_gloss]
                == [token.casefold() for token in prediction.isl_gloss]
            )
            for case, prediction in pairs
        ),
        asset_coverage=asset_coverage,
        animation_readiness=asset_coverage,
        avatar_continuity=_mean(continuity),
        latency_mean_ms=_mean(latencies),
        latency_p95_ms=_percentile(latencies, 0.95),
        missing_prediction_ids=missing,
        notes=[
            "Translation similarity and the Malayalam-script fluency proxy are automated "
            "regression metrics, not substitutes for native-speaker review.",
            "Candidate ISL glosses do not become linguistic ground truth until native "
            "review is recorded.",
        ],
    )
