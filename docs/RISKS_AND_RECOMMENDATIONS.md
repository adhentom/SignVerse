# Risks and Recommendations

| Risk | Recommendation |
|---|---|
| Treating ISL as signed spoken language | Govern gloss and grammar with native ISL users and qualified experts. |
| Insufficient sentence-level data | Commission reviewed parallel text, gloss, and continuous-sign data. |
| Unknown dataset rights | Quarantine data until license, provenance, and consent are documented. |
| Hallucinated or altered meaning | Constrain output to a governed lexicon, validate candidates, expose confidence, and use explicit fallbacks. |
| Missing facial or bodily markers | Annotate and evaluate non-manual features as part of meaning. |
| Unnatural clip concatenation | Develop reviewed transitions and measure comprehension, not visual smoothness alone. |
| Speech-to-text propagation errors | Prefer captions, communicate uncertainty, and preserve correction paths. |
| Real-time latency | Stream clauses, prefetch assets, cache safely, and define latency budgets. |
| Meeting privacy | Require explicit activation and consent, minimize retention, and visibly indicate processing. |
| Excessive extension permissions | Use narrow, optional, site-specific grants wherever feasible. |
| Service-worker suspension | Persist checkpoints and support idempotent reconnect and resume. |
| Site changes | Isolate adapters, use feature flags, and maintain automated compatibility tests. |
| Regional variation | Store sign variants and allow reviewed user preferences. |
| Misleading interpreter claims | Clearly communicate limitations and avoid claims of certified interpretation. |
| High infrastructure cost | Prefer captions and retrieval, cache assets, and batch semantic segments. |
| Biased evaluation | Recruit diverse deaf ISL users and report subgroup performance. |

## Primary recommendation

Do not begin with unrestricted live speech or fully generated avatar motion. Validate a constrained, text-first, retrieval-based experience with the ISL community before increasing technical and linguistic scope.
