from fastapi.testclient import TestClient

from cll_genie_api.api.dependencies import get_services
from cll_genie_api.config import Settings
from cll_genie_api.domain.identity import LocalUser, Session
from cll_genie_api.main import create_app

USER = LocalUser(
    username="admin",
    fullname="Example Administrator",
    roles=("admin",),
    email="admin@example.test",
    password_hash="not-used-by-fake",
)


class FakeAuthentication:
    def authenticate(self, provider: str, username: str, password: str) -> LocalUser:
        return USER


class FakeSessions:
    def __init__(self) -> None:
        self.session = Session(
            token_id="opaque-token",
            csrf_token="csrf-token",
            user=USER,
            provider="local",
        )

    def create(self, user: LocalUser, provider: str) -> Session:
        return self.session

    def get(self, token: str) -> Session | None:
        return self.session if token == "opaque-token" else None

    def delete(self, token: str) -> None:
        pass


class FakeRulesCollection:
    def __init__(self):
        self.rules = {
            "valid_rule": {
                "_id": "valid_rule",
                "rule_key": "mutation.m_cll",
                "version": 1,
                "author": "analyst",
                "created_at": "2024-01-01T00:00:00Z",
                "condition": {"fact": "status", "op": "eq", "value": "M-CLL"},
                "template": {"text": "Patient is M-CLL"},
            }
        }

    def list(self):
        return list(self.rules.values())

    def create(self, rule_data):
        rule_data["_id"] = "new_rule"
        rule_data["version"] = 1
        self.rules["new_rule"] = rule_data
        return "new_rule"


class FakeServices:
    def __init__(self):
        self.settings = Settings(_env_file=None, environment="test")
        self.authentication = FakeAuthentication()
        self.sessions = FakeSessions()
        self.rules = FakeRulesCollection()


def client() -> TestClient:
    services = FakeServices()
    app = create_app()
    app.dependency_overrides[get_services] = lambda: services
    return TestClient(app)


def test_list_rules_requires_auth():
    app = create_app()
    test_client = TestClient(app)
    response = test_client.get("/cll_genie/api/v1/admin/rules")
    assert response.status_code == 401


def test_list_rules_returns_latest():
    with client() as test_client:
        test_client.cookies.set("cll_genie_session", "opaque-token")
        response = test_client.get("/cll_genie/api/v1/admin/rules")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["rule_key"] == "mutation.m_cll"


def test_create_rule_success():
    with client() as test_client:
        test_client.cookies.set("cll_genie_session", "opaque-token")
        response = test_client.post(
            "/cll_genie/api/v1/admin/rules",
            json={
                "rule_key": "mutation.borderline",
                "version": 1,
                "status": "DRAFT",
                "report_type": "CLL_IGHV",
                "language": "sv-SE",
                "section": "summary",
                "priority": 100,
                "condition": {
                    "fact": "combined_mutation_status",
                    "op": "eq",
                    "value": "Borderline",
                },
                "template": {"text": "Borderline"},
            },
            headers={"X-CSRF-Token": "csrf-token"},
        )
        assert response.status_code == 201
        assert response.json()["rule_id"] == "new_rule"
