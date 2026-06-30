from datetime import UTC, datetime, timedelta

import mongomock
from bson import ObjectId
from fastapi.testclient import TestClient

from cll_genie_api.api.dependencies import Services, get_services
from cll_genie_api.config import Settings
from cll_genie_api.domain.identity import LocalUser, Session
from cll_genie_api.infrastructure.audit import AuditService
from cll_genie_api.infrastructure.mongo import MongoCollections
from cll_genie_api.main import create_app


class FakeSessions:
    def __init__(self, roles: tuple[str, ...]) -> None:
        self.user = LocalUser("admin", "Admin", roles, None, None)

    def get(self, token: str) -> Session | None:
        if token != "valid":
            return None
        return Session("valid", "csrf", self.user, "local")


class FakeCollections:
    def __init__(self) -> None:
        self.audit_events = mongomock.MongoClient().cll_genie.audit_events


def client(roles: tuple[str, ...] = ("admin",)) -> tuple[TestClient, FakeCollections]:
    settings = Settings(_env_file=None, environment="test", log_file_enabled=False)
    collections = FakeCollections()
    services = Services(
        settings=settings,
        collections=collections,
        authentication=object(),
        sessions=FakeSessions(roles),
        audit=AuditService(collections.audit_events, retention_days=90, environment="test"),
    )
    app = create_app()
    app.dependency_overrides[get_services] = lambda: services
    test_client = TestClient(app)
    test_client.cookies.set(settings.session_cookie_name, "valid")
    return test_client, collections


def event(severity: str, message: str, *, actor: str, category: str) -> dict:
    now = datetime.now(UTC)
    return {
        "occurred_at": now,
        "expires_at": now + timedelta(days=90),
        "severity": severity,
        "category": category,
        "event_type": "test.event",
        "message": message,
        "outcome": "success",
        "actor": {"username": actor, "fullname": actor, "roles": [], "provider": "local"},
        "resource": {"type": "sample", "id": "sample-1", "name": "Sample 1"},
        "source": {"environment": "test", "client_ip": "127.0.0.1"},
        "tags": ["test"],
        "metadata": {},
    }


def test_admin_can_filter_and_paginate_audit_events() -> None:
    test_client, collections = client()
    collections.audit_events.insert_many(
        [
            event("info", "Report created", actor="alice", category="reporting"),
            event("warning", "Login rejected", actor="bob", category="security"),
        ]
    )

    with test_client:
        response = test_client.get(
            "/cll_genie/api/v1/admin/audit-logs?severity=warning&actor=bob&limit=1"
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    assert payload["items"][0]["message"] == "Login rejected"
    assert payload["severity_counts"]["warning"] == 1
    assert "security" in payload["categories"]


def test_non_admin_cannot_read_audit_events() -> None:
    test_client, _collections = client(("user",))
    with test_client:
        response = test_client.get("/cll_genie/api/v1/admin/audit-logs")
    assert response.status_code == 403


def test_audit_service_redacts_secrets_and_sets_expiry() -> None:
    _test_client, collections = client()
    service = AuditService(collections.audit_events, retention_days=90, environment="test")

    event_id = service.record(
        "auth.test",
        "Authentication event",
        category="security",
        metadata={"password": "never-store-this", "safe_value": 42},
    )

    stored = collections.audit_events.find_one({"_id": ObjectId(event_id)})
    assert stored["metadata"] == {"password": "[redacted]", "safe_value": 42}
    assert stored["expires_at"] > stored["occurred_at"]


def test_incompatible_legacy_index_does_not_block_other_indexes(caplog) -> None:
    collection = mongomock.MongoClient().cll_genie.users
    collection.insert_many(
        [
            {"email": "duplicate@example.test"},
            {"email": "duplicate@example.test"},
        ]
    )

    MongoCollections._create_index(
        collection,
        "email",
        unique=True,
        name="uq_user_email",
    )
    MongoCollections._create_index(collection, "username", name="ix_user_username")

    assert "Index could not be created" in caplog.text
    assert "ix_user_username" in collection.index_information()
