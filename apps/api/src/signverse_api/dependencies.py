from fastapi import Request

from signverse_api.services.interpretation import InterpretationService


def get_interpretation_service(request: Request) -> InterpretationService:
    service: InterpretationService = request.app.state.interpretation_service
    return service
