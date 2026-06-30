from fastapi.testclient import TestClient

from cll_genie_api.api.dependencies import get_services
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


class FakeSamplesCollection:
    def get(self, sample_id: str):
        if sample_id == "valid_id":
            return {"_id": "valid_id", "name": "TestSample", "status": "Pending"}
        return None

    def list(self, *, search="", report_status=None, skip=0, limit=25):
        del search, report_status, skip, limit
        return (
            [
                {"_id": "valid_id", "name": "TestSample", "status": "Pending"},
                {"_id": "valid_id_2", "name": "TestSample2", "status": "Done"},
            ],
            2,
        )


class FakeVquestCollection:
    def get(self, sample_id: str):
        del sample_id
        return None


class FakeReportsCollection:
    def list_for_sample(self, sample_id: str):
        del sample_id
        return []


class FakeServices:
    def __init__(self):
        self.settings = Settings(_env_file=None, environment="test")
        self.authentication = FakeAuthentication()
        self.sessions = FakeSessions()
        self.samples = FakeSamplesCollection()
        self.vquest = FakeVquestCollection()
        self.reports = FakeReportsCollection()


def client() -> TestClient:
    services = FakeServices()
    app = create_app()
    app.dependency_overrides[get_services] = lambda: services
    return TestClient(app)


def test_list_samples_requires_auth():
    app = create_app()
    test_client = TestClient(app)
    response = test_client.get("/cll_genie/api/v1/samples")
    assert response.status_code == 401


def test_list_samples_returns_paginated_results():
    with client() as test_client:
        test_client.cookies.set("cll_genie_session", "opaque-token")
        response = test_client.get("/cll_genie/api/v1/samples")
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "total" in data
        assert data["total"] == 2
        assert len(data["items"]) == 2
        assert data["items"][0]["name"] == "TestSample"


def test_get_sample_by_id_returns_404_when_missing():
    with client() as test_client:
        test_client.cookies.set("cll_genie_session", "opaque-token")
        response = test_client.get("/cll_genie/api/v1/samples/invalid_id")
        assert response.status_code == 404


def test_get_sample_by_id_returns_data():
    with client() as test_client:
        test_client.cookies.set("cll_genie_session", "opaque-token")
        response = test_client.get("/cll_genie/api/v1/samples/valid_id")
        assert response.status_code == 200
        assert response.json()["sample"]["name"] == "TestSample"
