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

class FakeReportsCollection:
    def get(self, report_id: str):
        if report_id == "valid_report":
            return {"_id": "valid_report", "sample_id": "valid_sample"}
        return None
        
    def list_by_sample(self, sample_id: str):
        return [{"_id": "valid_report", "sample_id": sample_id}]

class FakeServices:
    def __init__(self):
        self.settings = Settings(_env_file=None, environment="test")
        self.authentication = FakeAuthentication()
        self.sessions = FakeSessions()
        self.reports = FakeReportsCollection()

def client() -> TestClient:
    services = FakeServices()
    app = create_app()
    app.dependency_overrides[get_services] = lambda: services
    return TestClient(app)

def test_list_reports_requires_auth():
    app = create_app()
    test_client = TestClient(app)
    response = test_client.get("/cll_genie/api/v1/samples/valid_id/reports")
    assert response.status_code == 401

def test_list_reports_returns_array():
    with client() as test_client:
        test_client.cookies.set("cll_genie_session", "opaque-token")
        response = test_client.get("/cll_genie/api/v1/samples/valid_sample/reports")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 1
        assert data[0]["_id"] == "valid_report"
