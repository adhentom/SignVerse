# Contributing to SignVerse AI

Thank you for helping improve accessible digital communication. Contributions must preserve user
privacy, fail safely when a sign is unsupported, and avoid claiming linguistic correctness without
native ISL review.

## Development workflow

1. Fork the repository and create a focused branch.
2. Install the extension and backend dependencies described in the README.
3. Add tests for behavior changes.
4. Run the full validation suite before opening a pull request.
5. Explain accessibility, privacy, dataset, and compatibility impacts in the pull request.

## Required checks

```bash
npm run typecheck
npm test
npm run build

cd apps/api
ruff check .
ruff format --check .
mypy
pytest

cd ../..
PYTHONPATH=scripts python -m pytest tools/tests
```

## Dataset and linguistic contributions

- Do not commit signer recordings, dictionary exports, or derived landmarks without explicit
  redistribution permission and documented provenance.
- Do not fabricate signs or mark a sign approved without a recorded native ISL reviewer.
- Include source, license, version, region, consent basis, reviewer, and review date.
- Keep unapproved material in ignored local import or quarantine directories.

## Pull requests

Keep changes small and describe what changed, why, test evidence, migration impact, and known
limitations. By contributing, you agree that your contribution is licensed under the MIT License.

Use GitHub issues for bugs and feature proposals. Report vulnerabilities privately according to
[SECURITY.md](SECURITY.md).
