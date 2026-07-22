# Benchmark Results

## Reference-integrity run

The offline reference-integrity run feeds each stored candidate reference back through the
metric implementation. It verifies metric and dataset plumbing; it is **not** a model-quality
claim.

| Metric | Result |
|---|---:|
| Cases loaded/evaluated | 200 / 200 |
| Native-reviewed cases | 0 |
| Semantic reference agreement | 1.0000 |
| Translation reference similarity | 1.0000 |
| Malayalam-script fluency proxy | 0.9967 |
| Gloss reference correctness | 1.0000 (floating-point approximation) |
| Exact gloss rate | 1.0000 |
| Existing asset coverage | 0.3171 |
| Expected gloss tokens | 820 |
| Unique expected concepts | 154 |

Asset coverage measures the current registry against candidate gloss concepts and does not
expand vocabulary or authorize an asset. The 31.71% result is diagnostic only.

## Model baseline status

A live 200-case OpenAI run was not performed automatically because it would incur external cost
and the references have not completed native review. Therefore no claim of improved production
linguistic accuracy is made from this offline run. The implementation makes quality measurable;
the next governance gate is native review followed by a recorded model run using fixed model and
prompt versions.
