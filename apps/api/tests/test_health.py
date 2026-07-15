import pytest
from httpx import AsyncClient


@pytest.mark.anyio
async def test_health_returns_readiness_metadata(client: AsyncClient) -> None:
    response = await client.get("/health", headers={"X-Request-ID": "health-test"})

    assert response.status_code == 200
    assert response.headers["X-Request-ID"] == "health-test"
    assert response.json() == {
        "status": "ok",
        "service": "signverse-api",
        "version": "0.1.0",
        "environment": "test",
    }
