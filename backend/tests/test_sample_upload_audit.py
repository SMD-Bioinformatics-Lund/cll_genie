import mongomock
from fastapi.testclient import TestClient

from cll_genie_api.api.dependencies import Services, get_services
from cll_genie_api.config import Settings
from cll_genie_api.domain.identity import LocalUser, Session
from cll_genie_api.infrastructure.artifacts import LocalArtifactStore
from cll_genie_api.infrastructure.audit import AuditService
from cll_genie_api.infrastructure.repositories import SampleRepository
from cll_genie_api.main import create_app


class FakeSessions:
    def __init__(self) -> None:
        user = LocalUser(
            username="analyst",
            fullname="Example Analyst",
            roles=("user",),
            email="analyst@example.test",
            password_hash=None,
        )
        self.session = Session("valid", "csrf", user, "ldap")

    def get(self, token: str) -> Session | None:
        return self.session if token == "valid" else None


def _client(tmp_path) -> tuple[TestClient, object, str]:
    database = mongomock.MongoClient().cll_genie
    sample_id = str(
        database.samples.insert_one(
            {"name": "25AB12345-SHM", "clarity_id": "CMD12345", "run_id": "RUN-1"}
        ).inserted_id
    )
    settings = Settings(_env_file=None, environment="test", log_file_enabled=False)
    collections = type("Collections", (), {"audit_events": database.audit_events})()
    services = Services(
        settings=settings,
        collections=collections,
        authentication=object(),
        sessions=FakeSessions(),
        samples=SampleRepository(database.samples),
        artifacts=LocalArtifactStore(tmp_path / "artifacts", database.artifacts),
        audit=AuditService(database.audit_events, retention_days=90, environment="test"),
    )
    app = create_app()
    app.dependency_overrides[get_services] = lambda: services
    client = TestClient(app)
    client.cookies.set(settings.session_cookie_name, "valid")
    return client, database, sample_id


def test_personal_excel_and_qc_uploads_include_file_and_user_details(tmp_path) -> None:
    client, database, sample_id = _client(tmp_path)
    headers = {"X-CSRF-Token": "csrf"}

    with client:
        excel_response = client.post(
            f"/cll_genie/api/v1/samples/{sample_id}/artifacts/lymphotrack-excel",
            headers=headers,
            files={
                "file": (
                    "result.xlsx",
                    b"test-workbook",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
        )
        qc_response = client.post(
            f"/cll_genie/api/v1/samples/{sample_id}/artifacts/lymphotrack-qc",
            headers=headers,
            files={
                "file": (
                    "result.fastq_indexQ30.tsv",
                    b"totalCount\t1000\ncountQ30\t950\nindexQ30\t95.0\n",
                    "text/tab-separated-values",
                )
            },
        )

    assert excel_response.status_code == 201
    assert qc_response.status_code == 201
    excel_event = database.audit_events.find_one(
        {"event_type": "sample.lymphotrack_excel.uploaded"}
    )
    assert excel_event["actor"]["username"] == "analyst"
    assert excel_event["actor"]["provider"] == "ldap"
    assert excel_event["resource"]["name"] == "25AB12345-SHM"
    assert excel_event["metadata"]["filename"] == "result.xlsx"
    assert excel_event["metadata"]["size_bytes"] == len(b"test-workbook")
    assert len(excel_event["metadata"]["sha256"]) == 64
    assert excel_event["source"]["method"] == "POST"

    qc_event = database.audit_events.find_one({"event_type": "sample.lymphotrack_qc.uploaded"})
    assert qc_event["metadata"]["qc_metrics"] == {
        "total_bases": 1000,
        "q30_bases": 950,
        "q30_per": 95.0,
    }


def test_rejected_personal_upload_is_audited(tmp_path) -> None:
    client, database, sample_id = _client(tmp_path)

    with client:
        response = client.post(
            f"/cll_genie/api/v1/samples/{sample_id}/artifacts/lymphotrack-qc",
            headers={"X-CSRF-Token": "csrf"},
            files={"file": ("invalid.tsv", b"not-valid-qc", "text/tab-separated-values")},
        )

    assert response.status_code == 422
    event = database.audit_events.find_one({"event_type": "sample.lymphotrack_qc.upload_failed"})
    assert event["severity"] == "warning"
    assert event["outcome"] == "failure"
    assert event["actor"]["username"] == "analyst"
    assert event["metadata"]["reason"] == "invalid_qc_content"
    assert event["metadata"]["filename"] == "invalid.tsv"
