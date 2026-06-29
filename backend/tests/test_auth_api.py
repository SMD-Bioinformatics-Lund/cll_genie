from fastapi.testclient import TestClient

from cll_genie_api.api.dependencies import Services, get_services
from cll_genie_api.config import Settings
from cll_genie_api.domain.identity import LocalUser, Session
from cll_genie_api.main import create_app

USER = LocalUser(
    username="analyst",
    fullname="Example Analyst",
    roles=("lymphotrack",),
    email="analyst@example.test",
    password_hash="not-used-by-fake",
)


class FakeAuthentication:
    def authenticate(self, provider: str, username: str, password: str) -> LocalUser:
        expected_login = USER.email if provider == "ldap" else USER.username
        if provider not in {"local", "ldap"} or username != expected_login or password != "secret":
            from cll_genie_api.infrastructure.authentication import AuthenticationFailed

            raise AuthenticationFailed
        return USER


class FakeSessions:
    def __init__(self) -> None:
        self.session: Session | None = None

    def create(self, user: LocalUser, provider: str) -> Session:
        self.session = Session(
            token_id="opaque-token",
            csrf_token="csrf-token",
            user=user,
            provider=provider,
        )
        return self.session

    def get(self, token: str) -> Session | None:
        return self.session if token == "opaque-token" else None

    def delete(self, token: str) -> None:
        if token == "opaque-token":
            self.session = None


class FakeCollections:
    def ping(self) -> None:
        return None


def client() -> TestClient:
    settings = Settings(
        _env_file=None,
        environment="test",
        auth_providers=["local", "ldap"],
        ldap_host="ldap://ldap.example.test",
        ldap_base_dn="dc=example,dc=test",
    )
    services = Services(
        settings=settings,
        collections=FakeCollections(),
        authentication=FakeAuthentication(),
        sessions=FakeSessions(),
    )
    app = create_app()
    app.dependency_overrides[get_services] = lambda: services
    return TestClient(app)


def test_providers_expose_local_and_ldap() -> None:
    with client() as test_client:
        response = test_client.get("/cll_genie/api/v1/auth/providers")

    assert response.status_code == 200
    assert [item["id"] for item in response.json()["providers"]] == ["ldap", "local"]


def test_every_application_route_uses_cll_genie_prefix() -> None:
    app = create_app()
    assert app.routes
    assert all(route.path.startswith("/cll_genie/") for route in app.routes)


def test_login_me_and_csrf_protected_logout() -> None:
    with client() as test_client:
        login = test_client.post(
            "/cll_genie/api/v1/auth/login",
            json={
                "provider": "ldap",
                "username": "analyst@example.test",
                "password": "secret",
            },
        )
        assert login.status_code == 200
        assert login.json()["user"]["fullname"] == "Example Analyst"
        assert login.json()["provider"] == "ldap"
        assert "Path=/cll_genie" in login.headers["set-cookie"]
        assert test_client.cookies.get("cll_genie_session") == "opaque-token"

        me = test_client.get("/cll_genie/api/v1/auth/me")
        assert me.status_code == 200

        rejected = test_client.post("/cll_genie/api/v1/auth/logout")
        assert rejected.status_code == 403

        logout = test_client.post(
            "/cll_genie/api/v1/auth/logout",
            headers={"X-CSRF-Token": "csrf-token"},
        )
        assert logout.status_code == 200

        signed_out = test_client.get("/cll_genie/api/v1/auth/me")
        assert signed_out.status_code == 401
