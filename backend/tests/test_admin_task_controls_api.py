import mongomock
from fastapi.testclient import TestClient

from cll_genie_api.api.dependencies import Services, get_services
from cll_genie_api.config import Settings
from cll_genie_api.domain.identity import LocalUser, Session
from cll_genie_api.infrastructure.audit import AuditService
from cll_genie_api.infrastructure.repositories import OperationalStateRepository
from cll_genie_api.main import create_app


class FakeSessions:
    def __init__(self, roles: tuple[str, ...] = ("admin",)) -> None:
        self.user = LocalUser(
            "operator",
            "Operator",
            roles,
            "operator@example.test",
            None,
            ("ldap",),
        )

    def get(self, token: str) -> Session | None:
        if token != "valid":
            return None
        return Session("valid", "csrf", self.user, "local")


class Collections:
    def __init__(self) -> None:
        database = mongomock.MongoClient().cll_genie
        self.operational_state = database.operational_state
        self.audit_events = database.audit_events


def client(roles: tuple[str, ...] = ("admin",)) -> tuple[TestClient, Collections]:
    settings = Settings(_env_file=None, environment="test", log_file_enabled=False)
    collections = Collections()
    services = Services(
        settings=settings,
        collections=collections,
        authentication=object(),
        sessions=FakeSessions(roles),
        operational_state=OperationalStateRepository(collections.operational_state),
        audit=AuditService(collections.audit_events, retention_days=90, environment="test"),
    )
    app = create_app()
    app.dependency_overrides[get_services] = lambda: services
    test_client = TestClient(app)
    test_client.cookies.set(settings.session_cookie_name, "valid")
    return test_client, collections


def test_admin_can_disable_and_list_task_controls() -> None:
    test_client, collections = client()

    with test_client:
        response = test_client.patch(
            "/cll_genie/api/v1/admin/task-controls/automated_ingestion",
            headers={"X-CSRF-Token": "csrf"},
            json={"enabled": False},
        )
        list_response = test_client.get("/cll_genie/api/v1/admin/task-controls")

    assert response.status_code == 200
    assert response.json()["enabled"] is False
    assert collections.operational_state.find_one({"_id": "automated_ingestion"})[
        "enabled"
    ] is False
    assert list_response.status_code == 200
    controls = {item["key"]: item for item in list_response.json()}
    assert controls["automated_ingestion"]["enabled"] is False
    assert controls["vquest_analysis"]["enabled"] is True

    event = collections.audit_events.find_one(
        {"event_type": "operations.task_control.updated"}
    )
    assert event is not None
    assert event["resource"]["id"] == "automated_ingestion"
    assert event["metadata"]["enabled"] is False


def test_non_admin_cannot_manage_task_controls() -> None:
    test_client, _collections = client(("lymphotrack_admin",))

    with test_client:
        response = test_client.get("/cll_genie/api/v1/admin/task-controls")

    assert response.status_code == 403
