from signverse_api.prompts.isl_interpretation import (
    SEMANTIC_ANALYSIS_SYSTEM_PROMPT,
    SIGNVERSE_ISL_SYSTEM_PROMPT,
)


def test_semantic_prompt_covers_real_world_language_phenomena() -> None:
    required = (
        "entire current sentence",
        "phrasal verbs",
        "idioms",
        "pronoun",
        "active or passive voice",
        "fillers",
        "spoken fragment",
        "emotion",
        "semantic confidence",
        "smallest complete discourse units",
        "let's jump in",
        "never guess that object",
    )

    assert all(term in SEMANTIC_ANALYSIS_SYSTEM_PROMPT for term in required)
    assert "do not create ISL glosses" in SEMANTIC_ANALYSIS_SYSTEM_PROMPT


def test_realization_prompt_requires_natural_malayalam_and_sentence_level_isl() -> None:
    required = (
        "native speaker",
        "rather than by\ntheir component words",
        "ordered ISL phrase",
        "English SVO order",
        "head shake for negation",
        "classifier",
        "Confidence is epistemic uncertainty",
        "natural spoken Malayalam",
        "LANGUAGE-LABEL",
        "lower ISL confidence",
    )

    assert all(term in SIGNVERSE_ISL_SYSTEM_PROMPT for term in required)
    assert (
        "do not reconstruct or assume the original English sentence" in SIGNVERSE_ISL_SYSTEM_PROMPT
    )
