from pathlib import Path

from fastapi.testclient import TestClient

from cll_genie_api.api.dependencies import Services, get_services
from cll_genie_api.config import Settings
from cll_genie_api.domain.identity import LocalUser, Session
from cll_genie_api.main import create_app


class FakeSessions:
    def __init__(self, roles: tuple[str, ...]) -> None:
        self.user = LocalUser("admin", "Admin", roles, None, None)

    def get(self, token: str) -> Session | None:
        if token != "valid":
            return None
        return Session("valid", "csrf", self.user, "local")


def client(log_root: Path, roles: tuple[str, ...]) -> TestClient:
    settings = Settings(_env_file=None, environment="test", log_root=log_root)
    services = Services(
        settings=settings,
        collections=object(),
        authentication=object(),
        sessions=FakeSessions(roles),
    )
    app = create_app()
    app.dependency_overrides[get_services] = lambda: services
    test_client = TestClient(app)
    test_client.cookies.set(settings.session_cookie_name, "valid")
    return test_client


def test_admin_can_read_only_audit_records(tmp_path: Path) -> None:
    (tmp_path / "app.log").write_text(
        "2026-01-01 - server - INFO - started\n"
        "2026-01-02 - audit - INFO - AUDIT: user.created\n"
        "2026-01-03 - audit - INFO - AUDIT: report.hidden\n",
        encoding="utf-8",
    )

    with client(tmp_path, ("admin",)) as test_client:
        response = test_client.get("/cll_genie/api/v1/admin/audit-logs?limit=1")

    assert response.status_code == 200
    assert response.json()["items"] == [
        "2026-01-03 - audit - INFO - AUDIT: report.hidden"
    ]


def test_non_admin_cannot_read_audit_records(tmp_path: Path) -> None:
    with client(tmp_path, ("user",)) as test_client:
        response = test_client.get("/cll_genie/api/v1/admin/audit-logs")

    assert response.status_code == 403
