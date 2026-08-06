from fastapi.testclient import TestClient

from cll_genie_api.api.dependencies import Services, get_services
from cll_genie_api.config import Settings
from cll_genie_api.domain.identity import LocalUser, Session
from cll_genie_api.main import create_app

USER = LocalUser(
    username="analyst",
    fullname="Example Analyst",
    roles=("user",),
    email="analyst@example.test",
    password_hash="not-used-by-fake",
)


class FakeSessions:
    def get(self, token: str) -> Session | None:
        if token != "opaque-token":
            return None
        return Session("opaque-token", "csrf-token", USER, "local")


class DisabledOperationalState:
    def is_enabled(self, key: str) -> bool:
        assert key == "vquest_analysis"
        return False

    def mark_queued(self, *_args, **_kwargs) -> None:
        raise AssertionError("disabled V-QUEST must not be marked as queued")


class JobsMustNotBeUsed:
    def create(self, *_args, **_kwargs):
        raise AssertionError("disabled V-QUEST must not create a job")


def client() -> TestClient:
    services = Services(
        settings=Settings(_env_file=None, environment="test", log_file_enabled=False),
        collections=object(),
        authentication=object(),
        sessions=FakeSessions(),
        jobs=JobsMustNotBeUsed(),
        operational_state=DisabledOperationalState(),
    )
    app = create_app()
    app.dependency_overrides[get_services] = lambda: services
    test_client = TestClient(app)
    test_client.cookies.set("cll_genie_session", "opaque-token")
    return test_client


def test_disabled_vquest_submission_returns_503_without_creating_job() -> None:
    with client() as test_client:
        response = test_client.post(
            "/cll_genie/api/v1/samples/sample-id/submit-vquest",
            headers={"X-CSRF-Token": "csrf-token"},
            json={
                "sequences": [
                    {
                        "sequence_id": "SEQ1",
                        "sequence": "ACGT",
                        "merge_count": 10,
                        "total_reads_percent": 80,
                        "in_frame": True,
                        "no_stop_codon": True,
                    }
                ],
                "options": {},
            },
        )

    assert response.status_code == 503
    assert response.json()["detail"] == (
        "IMGT/V-QUEST analysis is currently disabled by an administrator"
    )
