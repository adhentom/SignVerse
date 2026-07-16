from fastapi import APIRouter

from signverse_api.api.routes import health, interpretation, streaming

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(interpretation.router)
api_router.include_router(streaming.router)
