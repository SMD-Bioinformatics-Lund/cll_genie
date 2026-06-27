import secrets
from dataclasses import dataclass
from functools import lru_cache
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, status

from cll_genie_api.config import Settings, get_settings
from cll_genie_api.domain.identity import Session
from cll_genie_api.infrastructure.artifacts import LocalArtifactStore
from cll_genie_api.infrastructure.authentication import (
    AuthenticationService,
    LdapAuthenticator,
    LocalAuthenticator,
)
from cll_genie_api.infrastructure.mongo import MongoCollections, get_collections
from cll_genie_api.infrastructure.repositories import (
    AuditRepository,
    JobRepository,
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
    audit: AuditRepository | None = None
    artifacts: LocalArtifactStore | None = None


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
        audit=AuditRepository(collections.audit),
        artifacts=LocalArtifactStore(settings.artifact_root, collections.artifacts),
    )


def get_current_session(
    request: Request,
    services: Annotated[Services, Depends(get_services)],
) -> Session:
    session_cookie = request.cookies.get(services.settings.session_cookie_name)
    if not session_cookie:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    session = services.sessions.get(session_cookie)
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    return session


def require_csrf(
    session: Annotated[Session, Depends(get_current_session)],
    csrf_token: Annotated[str | None, Header(alias="X-CSRF-Token")] = None,
) -> Session:
    if not csrf_token or not secrets.compare_digest(csrf_token, session.csrf_token):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="CSRF validation failed")
    return session


def permission_dependency(permission: str):
    def check(session: Annotated[Session, Depends(get_current_session)]) -> Session:
        if permission not in session.user.permissions:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action",
            )
        return session

    return check


def assert_permission(session: Session, permission: str) -> None:
    if permission not in session.user.permissions:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to perform this action",
        )
