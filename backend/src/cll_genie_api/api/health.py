from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from redis import Redis

from cll_genie_api.api.dependencies import Services, get_services
from cll_genie_api.api.schemas import HealthResponse, SystemStatusResponse

SCHEDULER_HEARTBEAT_KEY = "cll_genie:scheduler:heartbeat"

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
    from cll_genie_api.worker import celery_app

    db_status = "ok"
    try:
        services.collections.ping()
    except Exception:
        db_status = "error"

    imgt_status = "ok"
    try:
        timeout = httpx.Timeout(
            connect=min(services.settings.imgt_connect_timeout_seconds, 5),
            read=5,
            write=5,
            pool=5,
        )
        with httpx.Client(
            timeout=timeout,
            follow_redirects=True,
            headers={"User-Agent": "CLL-Genie health check"},
        ) as client:
            with client.stream("GET", services.settings.imgt_vquest_url) as response:
                if response.status_code >= 500:
                    imgt_status = "error"
    except Exception:
        imgt_status = "error"

    redis_status = "ok"
    scheduler_status = "ok"
    try:
        redis_client = Redis.from_url(
            services.settings.redis_url,
            socket_connect_timeout=2,
            socket_timeout=2,
        )
        redis_client.ping()
        if not redis_client.exists(SCHEDULER_HEARTBEAT_KEY):
            scheduler_status = "error"
    except Exception:
        redis_status = "error"
        scheduler_status = "error"

    celery_status = "ok"
    try:
        with celery_app.connection_for_read() as connection:
            connection.ensure_connection(max_retries=0, timeout=2)
    except Exception:
        celery_status = "error"

    worker_status = "ok"
    try:
        replies = celery_app.control.inspect(timeout=2).ping()
        if not replies:
            worker_status = "error"
    except Exception:
        worker_status = "error"

    return SystemStatusResponse(
        api="ok",
        database=db_status,
        imgt=imgt_status,
        redis=redis_status,
        celery=celery_status,
        worker=worker_status,
        scheduler=scheduler_status,
        version=services.settings.app_version,
    )
