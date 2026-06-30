from __future__ import annotations

import logging
import re
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from pymongo.errors import PyMongoError

from cll_genie_api.domain.identity import LocalUser
from cll_genie_api.infrastructure.logging import current_request_context

AuditSeverity = Literal["info", "warning", "error", "critical"]
AuditOutcome = Literal["success", "failure", "denied"]

_sensitive_keys = re.compile(
    r"password|secret|token|cookie|authorization|sequence|report_body|file_content",
    re.IGNORECASE,
)


def _safe(value: Any, *, depth: int = 0) -> Any:
    if depth > 4:
        return "[depth-limited]"
    if isinstance(value, dict):
        return {
            str(key): "[redacted]"
            if _sensitive_keys.search(str(key))
            else _safe(item, depth=depth + 1)
            for key, item in list(value.items())[:50]
        }
    if isinstance(value, list | tuple | set):
        return [_safe(item, depth=depth + 1) for item in list(value)[:50]]
    if isinstance(value, str):
        return value[:1000]
    if value is None or isinstance(value, bool | int | float | datetime):
        return value
    return str(value)[:1000]


class AuditService:
    """Append-only, queryable security and business activity events."""

    def __init__(self, collection, *, retention_days: int, environment: str) -> None:
        self.collection = collection
        self.retention_days = retention_days
        self.environment = environment
        self.logger = logging.getLogger("cll_genie.audit")

    def record(
        self,
        event_type: str,
        message: str,
        *,
        severity: AuditSeverity = "info",
        category: str,
        outcome: AuditOutcome = "success",
        actor: LocalUser | str | None = None,
        provider: str | None = None,
        resource_type: str | None = None,
        resource_id: str | None = None,
        resource_name: str | None = None,
        tags: list[str] | tuple[str, ...] = (),
        metadata: dict[str, Any] | None = None,
    ) -> str | None:
        now = datetime.now(UTC)
        request = current_request_context()
        actor_document: dict[str, Any]
        if isinstance(actor, LocalUser):
            actor_document = {
                "username": actor.username,
                "fullname": actor.fullname,
                "roles": list(actor.roles),
                "provider": provider,
            }
        else:
            actor_document = {
                "username": actor or "anonymous",
                "fullname": None,
                "roles": [],
                "provider": provider,
            }

        document: dict[str, Any] = {
            "occurred_at": now,
            "expires_at": now + timedelta(days=self.retention_days),
            "severity": severity,
            "category": category.strip().lower(),
            "event_type": event_type.strip().lower(),
            "message": message[:500],
            "outcome": outcome,
            "actor": actor_document,
            "resource": {
                "type": resource_type,
                "id": resource_id,
                "name": resource_name,
            },
            "source": {
                "application": "cll-genie",
                "environment": self.environment,
                "request_id": request.request_id if request else None,
                "client_ip": request.client_ip if request else None,
                "method": request.method if request else None,
                "path": request.path if request else None,
                "user_agent": request.user_agent[:500] if request and request.user_agent else None,
            },
            "tags": sorted({str(tag).strip().lower() for tag in tags if str(tag).strip()}),
            "metadata": _safe(metadata or {}),
        }
        try:
            event_id = self.collection.insert_one(document).inserted_id
        except PyMongoError:
            self.logger.critical(
                "Failed to persist audit event",
                exc_info=True,
                extra={"event_type": event_type, "audit_severity": severity},
            )
            return None
        self.logger.info(
            message,
            extra={
                "audit_event_id": str(event_id),
                "event_type": event_type,
                "audit_severity": severity,
                "outcome": outcome,
            },
        )
        return str(event_id)
