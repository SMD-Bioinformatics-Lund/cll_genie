import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from werkzeug.security import generate_password_hash

from cll_genie_api.api.dependencies import (
    Services,
    get_current_session,
    get_services,
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
    if "local" in services.settings.auth_providers:
        configured.append(ProviderResponse(id="local", label="Local account"))
    if services.settings.ldap_is_configured():
        configured.append(ProviderResponse(id="ldap", label="Organization account"))
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
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="The username, password, or authentication provider was not accepted",
        ) from exc

    session = services.sessions.create(user, payload.provider)
    response.set_cookie(
        key=services.settings.session_cookie_name,
        value=session.token,
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
    services.sessions.delete(session.token)
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
        
    result = services.collections.users.update_one({"_id": session.user.username}, {"$set": values})
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="User not found")
        
    logging.getLogger("audit").info(
        f"AUDIT: user.updated by {session.user.username} on user:{session.user.username} - {{\"fields\": {sorted(values)}}}"
    )
    return {"updated": True}
