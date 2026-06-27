from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from cll_genie_api.api.dependencies import Services, get_services
from cll_genie_api.api.schemas import HealthResponse

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/live", response_model=HealthResponse)
def live(services: Annotated[Services, Depends(get_services)]) -> HealthResponse:
    return HealthResponse(status="ok", version=services.settings.app_version)


@router.get("/ready", response_model=HealthResponse)
def ready(services: Annotated[Services, Depends(get_services)]) -> HealthResponse:
    try:
        services.collections.ping()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is unavailable",
        ) from exc
    return HealthResponse(status="ready", version=services.settings.app_version)
