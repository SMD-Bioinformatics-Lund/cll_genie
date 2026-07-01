from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from werkzeug.security import generate_password_hash

from cll_genie_api.api.dependencies import (
    Services,
    get_current_session,
    get_services,
    record_audit,
    require_csrf,
)
from cll_genie_api.api.schemas import (
    LoginRequest,
    MessageResponse,
    ProviderResponse,
    ProvidersResponse,
    SessionResponse,
    UserSettingsRequest,
    user_response,
)
from cll_genie_api.domain.identity import Session
from cll_genie_api.infrastructure.authentication import AuthenticationFailed

router = APIRouter(prefix="/auth", tags=["authentication"])


@router.get("/providers", response_model=ProvidersResponse)
def providers(services: Annotated[Services, Depends(get_services)]) -> ProvidersResponse:
    configured = []
    if services.settings.ldap_is_configured():
        configured.append(ProviderResponse(id="ldap", label="LDAP · Primary"))
    if "local" in services.settings.auth_providers:
        configured.append(ProviderResponse(id="local", label="Local"))
    return ProvidersResponse(
        providers=configured,
        version=services.settings.app_version,
        environment=services.settings.environment,
    )


@router.post("/login", response_model=SessionResponse)
def login(
    payload: LoginRequest,
    response: Response,
    services: Annotated[Services, Depends(get_services)],
) -> SessionResponse:
    try:
        user = services.authentication.authenticate(
            payload.provider,
            payload.username,
            payload.password,
        )
    except AuthenticationFailed as exc:
        record_audit(
            services,
            "auth.login.failed",
            "Authentication attempt was rejected",
            severity="warning",
            category="security",
            outcome="failure",
            actor=payload.username.strip() or "anonymous",
            provider=payload.provider,
            resource_type="session",
            tags=["authentication", "login", "failed-login"],
            metadata={"provider": payload.provider},
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="The username, password, or authentication provider was not accepted",
        ) from exc

    login_time = datetime.now(UTC)
    services.collections.users.update_one(
        {"username": user.username},
        {"$set": {"last_login": login_time}},
    )
    session = services.sessions.create(user, payload.provider)
    record_audit(
        services,
        "auth.login.succeeded",
        "User signed in",
        category="security",
        actor=user,
        provider=payload.provider,
        resource_type="session",
        tags=["authentication", "login"],
        metadata={"provider": payload.provider},
    )
    response.set_cookie(
        key=services.settings.session_cookie_name,
        value=session.token_id,
        max_age=services.settings.session_ttl_seconds,
        secure=services.settings.cookie_secure,
        httponly=True,
        samesite=services.settings.cookie_samesite,
        path=services.settings.application_prefix,
    )
    return SessionResponse(
        user=user_response(user),
        provider=session.provider,
        csrf_token=session.csrf_token,
    )


@router.post("/logout", response_model=MessageResponse)
def logout(
    response: Response,
    session: Annotated[Session, Depends(require_csrf)],
    services: Annotated[Services, Depends(get_services)],
) -> MessageResponse:
    services.sessions.delete(session.token_id)
    record_audit(
        services,
        "auth.logout.succeeded",
        "User signed out",
        category="security",
        actor=session.user,
        provider=session.provider,
        resource_type="session",
        tags=["authentication", "logout"],
    )
    response.delete_cookie(
        services.settings.session_cookie_name,
        path=services.settings.application_prefix,
        secure=services.settings.cookie_secure,
        httponly=True,
        samesite=services.settings.cookie_samesite,
    )
    return MessageResponse(message="Signed out")


@router.get("/me", response_model=SessionResponse)
def me(session: Annotated[Session, Depends(get_current_session)]) -> SessionResponse:
    return SessionResponse(
        user=user_response(session.user),
        provider=session.provider,
        csrf_token=session.csrf_token,
    )


@router.patch("/me")
def update_me(
    payload: UserSettingsRequest,
    session: Annotated[Session, Depends(require_csrf)],
    services: Annotated[Services, Depends(get_services)],
):
    if session.provider != "local" and payload.password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot change password for non-local accounts",
        )

    values = payload.model_dump(exclude_none=True, exclude={"password"})
    if payload.password:
        values["password"] = generate_password_hash(payload.password, method="pbkdf2:sha256")

    if not values:
        return {"updated": False}

    values.update({"updated_at": datetime.now(UTC), "updated_by": session.user.username})
    result = services.collections.users.update_one(
        {"username": session.user.username}, {"$set": values}
    )
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="User not found")

    changed_fields = sorted(
        key for key in values if key not in {"updated_at", "updated_by", "password"}
    )
    if payload.password:
        changed_fields.append("password")
    record_audit(
        services,
        "user.profile.updated",
        "User updated their profile",
        severity="warning" if payload.password else "info",
        category="identity",
        actor=session.user,
        provider=session.provider,
        resource_type="user",
        resource_id=session.user.username,
        tags=["profile", "identity"],
        metadata={"changed_fields": changed_fields},
    )
    return {"updated": True}
