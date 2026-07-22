from collections.abc import AsyncIterator
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from signverse_api.app import create_app
from signverse_api.config import Settings


@pytest.fixture(autouse=True)
def isolate_tests_from_local_dotenv(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("SIGNVERSE_INTERPRETATION_PROVIDER", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("SIGNVERSE_OPENAI_API_KEY", raising=False)


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture
async def client() -> AsyncIterator[AsyncClient]:
    settings = Settings(
        environment="test",
        cors_origins=["chrome-extension://test-extension"],
        interpretation_provider="mock",
    )
    app = create_app(settings)
    transport = ASGITransport(app=app)

    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=transport, base_url="http://test") as test_client:
            yield test_client
