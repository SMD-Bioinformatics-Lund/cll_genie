import secrets
from dataclasses import dataclass
from functools import lru_cache
from typing import Annotated, Any

from fastapi import Depends, Header, HTTPException, Request, status

from cll_genie_api.config import Settings, get_settings
from cll_genie_api.domain.identity import Session
from cll_genie_api.infrastructure.artifacts import LocalArtifactStore
from cll_genie_api.infrastructure.audit import AuditService
from cll_genie_api.infrastructure.authentication import (
    AuthenticationService,
    LdapAuthenticator,
    LocalAuthenticator,
)
from cll_genie_api.infrastructure.mongo import MongoCollections, get_collections
from cll_genie_api.infrastructure.repositories import (
    JobRepository,
    OperationalStateRepository,
    ReportRepository,
    RuleRepository,
    SampleRepository,
    SubmissionCounterRepository,
    VquestRepository,
)
from cll_genie_api.infrastructure.sessions import MongoSessionRepository
from cll_genie_api.infrastructure.users import MongoUserRepository


@dataclass(slots=True)
class Services:
    settings: Settings
    collections: MongoCollections
    authentication: AuthenticationService
    sessions: MongoSessionRepository
    samples: SampleRepository | None = None
    jobs: JobRepository | None = None
    counters: SubmissionCounterRepository | None = None
    vquest: VquestRepository | None = None
    reports: ReportRepository | None = None
    rules: RuleRepository | None = None
    artifacts: LocalArtifactStore | None = None
    audit: AuditService | None = None
    operational_state: OperationalStateRepository | None = None


def record_audit(services: Services, event_type: str, message: str, **details: Any) -> str | None:
    audit = getattr(services, "audit", None)
    if audit is None:
        return None
    return audit.record(event_type, message, **details)


@lru_cache
def get_services() -> Services:
    settings = get_settings()
    collections = get_collections()
    users = MongoUserRepository(collections.users)
    authenticators: dict[str, object] = {"local": LocalAuthenticator()}
    if settings.ldap_is_configured():
        authenticators["ldap"] = LdapAuthenticator(settings)
    return Services(
        settings=settings,
        collections=collections,
        authentication=AuthenticationService(users, authenticators),
        sessions=MongoSessionRepository(
            collections.sessions,
            users,
            settings.session_ttl_seconds,
        ),
        samples=SampleRepository(collections.samples),
        jobs=JobRepository(collections.jobs),
        counters=SubmissionCounterRepository(collections.counters, collections.results),
        vquest=VquestRepository(collections.results),
        reports=ReportRepository(collections.reports),
        rules=RuleRepository(collections.rules),
        artifacts=LocalArtifactStore(settings.artifact_root, collections.artifacts),
        operational_state=OperationalStateRepository(collections.operational_state),
        audit=AuditService(
            collections.audit_events,
            retention_days=settings.audit_retention_days,
            environment=settings.environment,
        ),
    )


def get_current_session(
    request: Request,
    services: Annotated[Services, Depends(get_services)],
) -> Session:
    request.state.services = services
    session_cookie = request.cookies.get(services.settings.session_cookie_name)
    if not session_cookie:
        if getattr(services, "audit", None):
            record_audit(
                services,
                "auth.session.rejected",
                "Request rejected because no authenticated session was present",
                severity="warning",
                category="security",
                outcome="denied",
                tags=["authentication", "session", "access-denied"],
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    session = services.sessions.get(session_cookie)
    if session is None:
        if getattr(services, "audit", None):
            record_audit(
                services,
                "auth.session.rejected",
                "Request rejected because the session was invalid or expired",
                severity="warning",
                category="security",
                outcome="denied",
                tags=["authentication", "session", "access-denied"],
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    request.state.session = session
    return session


def require_csrf(
    session: Annotated[Session, Depends(get_current_session)],
    csrf_token: Annotated[str | None, Header(alias="X-CSRF-Token")] = None,
) -> Session:
    if not csrf_token or not secrets.compare_digest(csrf_token, session.csrf_token):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="CSRF validation failed")
    return session


def role_dependency(roles: list[str]):
    def check(session: Annotated[Session, Depends(get_current_session)]) -> Session:
        required = {role.strip().lower() for role in roles}
        if required.isdisjoint(session.user.roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have the required role to perform this action",
            )
        return session

    return check


def assert_role(session: Session, roles: list[str]) -> None:
    required = {role.strip().lower() for role in roles}
    if required.isdisjoint(session.user.roles):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have the required role to perform this action",
        )
