from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient

from signverse_api.app import create_app
from signverse_api.config import Settings


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture
async def client() -> AsyncIterator[AsyncClient]:
    settings = Settings(environment="test", cors_origins=["chrome-extension://test-extension"])
    app = create_app(settings)
    transport = ASGITransport(app=app)

    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=transport, base_url="http://test") as test_client:
            yield test_client
