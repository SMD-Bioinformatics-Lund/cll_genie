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


def user(methods: tuple[str, ...]) -> LocalUser:
    return LocalUser(
        username="analyst",
        fullname="Example Analyst",
        roles=("user",),
        email="analyst@example.test",
        password_hash=generate_password_hash("local-password", method="pbkdf2:sha256"),
        allowed_login_methods=methods,
    )


def test_authentication_rejects_provider_different_from_user_identity() -> None:
    service = AuthenticationService(
        UserRepository(user(("ldap",))),
        {"local": LocalAuthenticator()},
    )

    with pytest.raises(AuthenticationFailed):
        service.authenticate("local", "analyst", "local-password")


def test_user_login_methods_are_read_only_from_the_explicit_document_field() -> None:
    user = LocalUser.from_document(
        {
            "username": "dual-user",
            "password": "hash",
            "roles": [],
            "allowed_login_methods": ["local", "ldap"],
        }
    )
    unconfigured = LocalUser.from_document({"username": "unconfigured", "roles": []})

    assert user.allowed_login_methods == ("ldap", "local")
    assert unconfigured.allowed_login_methods == ()


def test_local_user_requires_password_and_ldap_user_rejects_password() -> None:
    common = {
        "username": "new-user",
        "fullname": "New User",
        "firstname": "New",
        "lastname": "User",
        "email": "new.user@example.test",
        "roles": ["user"],
    }

    with pytest.raises(ValidationError):
        UserCreateRequest(**common, allowed_login_methods=["local"])
    with pytest.raises(ValidationError):
        UserCreateRequest(
            **common,
            allowed_login_methods=["ldap"],
            password="not-allowed",
        )

    local = UserCreateRequest(
        **common,
        allowed_login_methods=["ldap", "local"],
        password="valid-password",
    )
    assert local.allowed_login_methods == ["ldap", "local"]


def test_only_defined_application_roles_are_accepted() -> None:
    with pytest.raises(ValidationError):
        UserUpdateRequest(roles=["unknown-role"])

    payload = UserUpdateRequest(roles=["lymphotrack_admin", "admin", "admin"])
    assert payload.roles == ["admin", "lymphotrack_admin"]
