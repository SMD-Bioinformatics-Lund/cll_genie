from __future__ import annotations

import json
import logging
import sys
import time
import uuid
from contextvars import ContextVar, Token
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from concurrent_log_handler import ConcurrentTimedRotatingFileHandler

from cll_genie_api.config import Settings


@dataclass(frozen=True, slots=True)
class RequestContext:
    request_id: str
    client_ip: str | None
    method: str
    path: str
    user_agent: str | None


_request_context: ContextVar[RequestContext | None] = ContextVar("request_context", default=None)


def current_request_context() -> RequestContext | None:
    return _request_context.get()


def bind_request_context(context: RequestContext) -> Token:
    return _request_context.set(context)


def reset_request_context(token: Token) -> None:
    _request_context.reset(token)


class JsonFormatter(logging.Formatter):
    """One JSON object per line, suitable for files and container collectors."""

    _standard_fields = set(logging.makeLogRecord({}).__dict__) | {
        "message",
        "asctime",
    }

    def format(self, record: logging.LogRecord) -> str:
        context = current_request_context()
        payload: dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(record.created, UTC).isoformat(),
            "severity": record.levelname.lower(),
            "logger": record.name,
            "service": getattr(record, "service", None),
            "message": record.getMessage(),
        }
        if context:
            payload.update(
                {
                    "request_id": context.request_id,
                    "client_ip": context.client_ip,
                    "method": context.method,
                    "path": context.path,
                }
            )
        for key, value in record.__dict__.items():
            if key not in self._standard_fields and key not in payload and not key.startswith("_"):
                payload[key] = value
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str, ensure_ascii=False)


class ServiceFilter(logging.Filter):
    def __init__(self, service_name: str) -> None:
        super().__init__()
        self.service_name = service_name

    def filter(self, record: logging.LogRecord) -> bool:
        record.service = self.service_name
        return True


def configure_logging(settings: Settings, *, service_name: str | None = None) -> None:
    service = service_name or settings.log_service_name
    root = logging.getLogger()
    root.setLevel(settings.log_level.upper())
    for handler in root.handlers[:]:
        root.removeHandler(handler)
        handler.close()

    formatter = JsonFormatter()
    service_filter = ServiceFilter(service)

    console = logging.StreamHandler(sys.stdout)
    console.setFormatter(formatter)
    console.addFilter(service_filter)
    root.addHandler(console)

    if settings.log_file_enabled:
        try:
            Path(settings.log_root).mkdir(parents=True, exist_ok=True)
            rotating_file = ConcurrentTimedRotatingFileHandler(
                filename=Path(settings.log_root) / f"cll-genie-{service}.json.log",
                when="midnight",
                interval=1,
                backupCount=settings.log_retention_days,
                encoding="utf-8",
                utc=True,
                use_gzip=True,
            )
            rotating_file.setFormatter(formatter)
            rotating_file.addFilter(service_filter)
            root.addHandler(rotating_file)
        except OSError:
            root.exception(
                "File logging could not be initialized; continuing with stdout",
                extra={"log_root": str(settings.log_root)},
            )


def make_request_context(request: Any) -> RequestContext:
    return RequestContext(
        request_id=request.headers.get("X-Request-ID") or str(uuid.uuid4()),
        client_ip=request.client.host if request.client else None,
        method=request.method,
        path=request.url.path,
        user_agent=request.headers.get("User-Agent"),
    )


def elapsed_ms(started: float) -> float:
    return round((time.perf_counter() - started) * 1000, 2)
