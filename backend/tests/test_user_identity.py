import pytest
from pydantic import ValidationError
from werkzeug.security import generate_password_hash

from cll_genie_api.api.schemas import UserCreateRequest, UserUpdateRequest
from cll_genie_api.domain.identity import LocalUser
from cll_genie_api.infrastructure.authentication import (
    AuthenticationFailed,
    AuthenticationService,
    LocalAuthenticator,
)


class UserRepository:
    def __init__(self, user: LocalUser) -> None:
        self.user = user

    def get(self, _login: str) -> LocalUser:
        return self.user


def user(provider: str) -> LocalUser:
    return LocalUser(
        username="analyst",
        fullname="Example Analyst",
        roles=("lymphotrack",),
        email="analyst@example.test",
        password_hash=generate_password_hash("local-password", method="pbkdf2:sha256"),
        identity_provider=provider,
    )


def test_authentication_rejects_provider_different_from_user_identity() -> None:
    service = AuthenticationService(
        UserRepository(user("ldap")),
        {"local": LocalAuthenticator()},
    )

    with pytest.raises(AuthenticationFailed):
        service.authenticate("local", "analyst", "local-password")


def test_legacy_user_identity_is_inferred_without_rewriting_document() -> None:
    local = LocalUser.from_document({"username": "local", "password": "hash", "roles": []})
    ldap = LocalUser.from_document({"username": "ldap", "roles": []})

    assert local.identity_provider == "local"
    assert ldap.identity_provider == "ldap"


def test_local_user_requires_password_and_ldap_user_rejects_password() -> None:
    common = {
        "username": "new-user",
        "fullname": "New User",
        "firstname": "New",
        "lastname": "User",
        "email": "new.user@example.test",
        "roles": ["lymphotrack"],
    }

    with pytest.raises(ValidationError):
        UserCreateRequest(**common, identity_provider="local")
    with pytest.raises(ValidationError):
        UserCreateRequest(
            **common,
            identity_provider="ldap",
            password="not-allowed",
        )

    local = UserCreateRequest(
        **common,
        identity_provider="local",
        password="valid-password",
    )
    assert local.identity_provider == "local"


def test_only_defined_application_roles_are_accepted() -> None:
    with pytest.raises(ValidationError):
        UserUpdateRequest(roles=["unknown-role"])

    payload = UserUpdateRequest(roles=["lymphotrack_admin", "admin", "admin"])
    assert payload.roles == ["admin", "lymphotrack_admin"]
