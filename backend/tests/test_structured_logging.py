import json
import logging

from cll_genie_api.config import Settings
from cll_genie_api.infrastructure.logging import configure_logging


def test_structured_file_logging_uses_service_specific_json_file(tmp_path) -> None:
    settings = Settings(
        _env_file=None,
        environment="test",
        log_root=tmp_path,
        log_service_name="test-api",
        log_file_enabled=True,
        log_retention_days=7,
    )
    configure_logging(settings)

    logging.getLogger("cll_genie.test").warning(
        "Useful diagnostic",
        extra={"status_code": 503, "duration_ms": 12.5},
    )

    for handler in logging.getLogger().handlers:
        handler.flush()
    payload = json.loads(
        (tmp_path / "cll-genie-test-api.json.log").read_text(encoding="utf-8").strip()
    )
    assert payload["severity"] == "warning"
    assert payload["service"] == "test-api"
    assert payload["message"] == "Useful diagnostic"
    assert payload["status_code"] == 503
    assert payload["duration_ms"] == 12.5

    configure_logging(Settings(_env_file=None, environment="test", log_file_enabled=False))
