import mongomock
from fastapi.testclient import TestClient
from werkzeug.security import check_password_hash, generate_password_hash

from cll_genie_api.api.dependencies import Services, get_services
from cll_genie_api.config import Settings
from cll_genie_api.domain.identity import LocalUser, Session
from cll_genie_api.main import create_app


class FakeSessions:
    user = LocalUser(
        "admin",
        "Administrator",
        ("admin",),
        "admin@example.test",
        None,
        "local",
    )

    def get(self, token: str) -> Session | None:
        if token != "valid":
            return None
        return Session("valid", "csrf", self.user, "local")


class Collections:
    def __init__(self) -> None:
        self.users = mongomock.MongoClient().cll_genie.users


def client() -> tuple[TestClient, Collections]:
    settings = Settings(_env_file=None, environment="test", log_file_enabled=False)
    collections = Collections()
    services = Services(
        settings=settings,
        collections=collections,
        authentication=object(),
        sessions=FakeSessions(),
    )
    app = create_app()
    app.dependency_overrides[get_services] = lambda: services
    test_client = TestClient(app)
    test_client.cookies.set(settings.session_cookie_name, "valid")
    return test_client, collections


def test_create_local_user_stores_identity_and_hashed_password() -> None:
    test_client, collections = client()
    with test_client:
        response = test_client.post(
            "/cll_genie/api/v1/admin/users",
            headers={"X-CSRF-Token": "csrf"},
            json={
                "username": "local-user",
                "fullname": "Local User",
                "firstname": "Local",
                "lastname": "User",
                "email": "local@example.test",
                "roles": ["lymphotrack", "admin"],
                "identity_provider": "local",
                "password": "local-password",
                "enabled": True,
            },
        )

    assert response.status_code == 201
    stored = collections.users.find_one({"username": "local-user"})
    assert stored["identity_provider"] == "local"
    assert check_password_hash(stored["password"], "local-password")
    assert stored["roles"] == ["admin", "lymphotrack"]


def test_switching_local_user_to_ldap_removes_local_password() -> None:
    test_client, collections = client()
    collections.users.insert_one(
        {
            "username": "existing-user",
            "fullname": "Existing User",
            "email": "existing@example.test",
            "roles": ["lymphotrack"],
            "identity_provider": "local",
            "password": generate_password_hash("old-password", method="pbkdf2:sha256"),
            "enabled": True,
        }
    )

    with test_client:
        response = test_client.patch(
            "/cll_genie/api/v1/admin/users/existing-user",
            headers={"X-CSRF-Token": "csrf"},
            json={"identity_provider": "ldap"},
        )

    assert response.status_code == 200
    stored = collections.users.find_one({"username": "existing-user"})
    assert stored["identity_provider"] == "ldap"
    assert "password" not in stored
