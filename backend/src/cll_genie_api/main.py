from fastapi import FastAPI
from fastapi.responses import JSONResponse

from cll_genie_api.api.admin import router as admin_router
from cll_genie_api.api.auth import router as auth_router
from cll_genie_api.api.health import router as health_router
from cll_genie_api.api.jobs import router as jobs_router
from cll_genie_api.api.reports import router as reports_router
from cll_genie_api.api.samples import router as samples_router
from cll_genie_api.api.submissions import router as submissions_router
from cll_genie_api.config import get_settings
import logging
import logging.handlers
from pathlib import Path
import os

def setup_logger():
    settings = get_settings()
    log_dir = Path("/var/log/cll-genie") if settings.environment == "production" else Path("/tmp/cll-genie-logs")
    log_dir.mkdir(parents=True, exist_ok=True)
    
    log_file = log_dir / "app.log"
    
    logger = logging.getLogger()
    logger.setLevel(logging.INFO)
    
    # Remove existing handlers to avoid duplicates
    for handler in logger.handlers[:]:
        logger.removeHandler(handler)

    formatter = logging.Formatter(
        "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )

    # Console handler
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

    # TimedRotatingFileHandler for daily rotation
    file_handler = logging.handlers.TimedRotatingFileHandler(
        filename=log_file,
        when="midnight",
        interval=1,
        backupCount=30,  # Keep 30 days of logs
        encoding="utf-8"
    )
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)

setup_logger()


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
