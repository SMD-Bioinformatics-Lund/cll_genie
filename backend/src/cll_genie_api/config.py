from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "CLL Genie"
    app_version: str = "2.0.0"
    environment: Literal["development", "test", "validation", "production"] = "development"
    application_prefix: str = "/cll_genie"
    api_prefix: str = "/cll_genie/api/v1"

    mongodb_uri: str = "mongodb://host.docker.internal:27017"
    application_database: str = "cll_genie"
    identity_database: str = "coyote"
    users_collection: str = "users"
    sessions_collection: str = "cll_genie_sessions"
    samples_collection: str = "samples"
    results_collection: str = "vquest_results"
    drafts_collection: str = "analysis_drafts"
    jobs_collection: str = "analysis_jobs"
    counters_collection: str = "submission_counters"
    artifacts_collection: str = "artifacts"
    reports_collection: str = "reports"
    rules_collection: str = "report_rules"
    audit_collection: str = "audit_events"

    auth_providers: Annotated[list[Literal["local", "ldap"]], NoDecode] = Field(
        default_factory=lambda: ["local"]
    )
    session_cookie_name: str = "cll_genie_session"
    session_ttl_seconds: int = 8 * 60 * 60
    cookie_secure: bool = False
    cookie_samesite: Literal["lax", "strict"] = "lax"

    ldap_uri: str | None = None
    ldap_base_dn: str | None = None
    ldap_user_filter: str = "(uid={username})"
    ldap_bind_dn: str | None = None
    ldap_bind_password: str | None = None
    ldap_connect_timeout_seconds: float = 5.0
    artifact_root: Path = Path("/var/lib/cll-genie/artifacts")
    redis_url: str = "redis://redis:6379/0"
    celery_eager: bool = False
    imgt_vquest_url: str = "https://www.imgt.org/IMGT_vquest/analysis"
    imgt_connect_timeout_seconds: float = 5.0
    imgt_read_timeout_seconds: float = 180.0
    page_size_default: int = 25
    page_size_max: int = 100
    mutation_borderline_lower: float = 97.0
    mutation_borderline_upper: float = 97.99
    pdf_analysis_run_at: str = ""
    run_root: Path = Path("/data/MiSeq")
    lymphotrack_results_root: Path = Path("/data/lymphotrack/results/lymphotrack_dx")
    run_rta_marker: str = "RTAComplete.txt"
    run_pipeline_marker: str = "cdm.done"
    run_cll_genie_marker: str = "cll_genie.done"

    @field_validator("auth_providers", mode="before")
    @classmethod
    def parse_auth_providers(cls, value: object) -> object:
        if isinstance(value, str):
            return [part.strip().lower() for part in value.split(",") if part.strip()]
        return value

    def ldap_is_configured(self) -> bool:
        return "ldap" in self.auth_providers and bool(self.ldap_uri and self.ldap_base_dn)


@lru_cache
def get_settings() -> Settings:
    return Settings()
