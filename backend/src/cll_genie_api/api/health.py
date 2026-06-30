from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from cll_genie_api.api.dependencies import Services, get_services
from cll_genie_api.api.schemas import HealthResponse, SystemStatusResponse

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


@router.get("/system", response_model=SystemStatusResponse)
def system(services: Annotated[Services, Depends(get_services)]) -> SystemStatusResponse:
    import httpx

    db_status = "ok"
    try:
        services.collections.ping()
    except Exception:
        db_status = "error"

    imgt_status = "ok"
    try:
        r = httpx.head(services.settings.imgt_vquest_url, timeout=3.0)
        if r.status_code >= 400 and r.status_code != 405:
            # 405 Method Not Allowed is fine, means server is up
            imgt_status = "error"
    except Exception:
        imgt_status = "error"

    return SystemStatusResponse(
        database=db_status,
        imgt=imgt_status,
        version=services.settings.app_version,
    )
