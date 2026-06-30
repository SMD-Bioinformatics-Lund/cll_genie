import logging
import time

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from cll_genie_api.api.admin import router as admin_router
from cll_genie_api.api.auth import router as auth_router
from cll_genie_api.api.health import router as health_router
from cll_genie_api.api.jobs import router as jobs_router
from cll_genie_api.api.reports import router as reports_router
from cll_genie_api.api.samples import router as samples_router
from cll_genie_api.api.submissions import router as submissions_router
from cll_genie_api.config import get_settings
from cll_genie_api.infrastructure.logging import (
    bind_request_context,
    configure_logging,
    elapsed_ms,
    make_request_context,
    reset_request_context,
)

configure_logging(get_settings())


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        docs_url=f"{settings.api_prefix}/docs" if settings.environment != "production" else None,
        swagger_ui_oauth2_redirect_url=(
            f"{settings.api_prefix}/docs/oauth2-redirect"
            if settings.environment != "production"
            else None
        ),
        redoc_url=None,
        openapi_url=(
            f"{settings.api_prefix}/openapi.json" if settings.environment != "production" else None
        ),
    )

    @app.middleware("http")
    async def request_observability(request: Request, call_next):
        context = make_request_context(request)
        token = bind_request_context(context)
        started = time.perf_counter()
        logger = logging.getLogger("cll_genie.request")
        try:
            response = await call_next(request)
            duration = elapsed_ms(started)
            response.headers["X-Request-ID"] = context.request_id
            logger.info(
                "HTTP request completed",
                extra={"status_code": response.status_code, "duration_ms": duration},
            )
            if response.status_code == 403:
                services = getattr(request.state, "services", None)
                session = getattr(request.state, "session", None)
                if services and getattr(services, "audit", None):
                    services.audit.record(
                        "security.access.denied",
                        "Authenticated request was denied",
                        severity="warning",
                        category="security",
                        outcome="denied",
                        actor=session.user if session else None,
                        provider=session.provider if session else None,
                        tags=["authorization", "access-denied"],
                        metadata={"status_code": 403},
                    )
            return response
        except Exception:
            logger.exception(
                "Unhandled HTTP request failure",
                extra={"duration_ms": elapsed_ms(started)},
            )
            raise
        finally:
            reset_request_context(token)

    @app.exception_handler(404)
    async def not_found(_request, _exception):
        return JSONResponse(
            status_code=404,
            content={
                "type": "about:blank",
                "title": "Not found",
                "status": 404,
                "detail": "The requested resource was not found",
            },
        )

    app.include_router(auth_router, prefix=settings.api_prefix)
    app.include_router(samples_router, prefix=settings.api_prefix)
    app.include_router(jobs_router, prefix=settings.api_prefix)
    app.include_router(submissions_router, prefix=settings.api_prefix)
    app.include_router(reports_router, prefix=settings.api_prefix)
    app.include_router(admin_router, prefix=settings.api_prefix)
    app.include_router(health_router, prefix=settings.application_prefix)
    return app


app = create_app()
