import pytest
from werkzeug.security import generate_password_hash

from cll_genie_api.domain.identity import LocalUser
from cll_genie_api.infrastructure.authentication import (
    AuthenticationFailed,
    AuthenticationService,
    LocalAuthenticator,
)


class UserRepository:
    def __init__(self, user: LocalUser | None) -> None:
        self.user = user

    def get(self, username: str) -> LocalUser | None:
        return (
            self.user
            if self.user and username in {self.user.username, self.user.email}
            else None
        )


def test_existing_werkzeug_password_and_local_profile_are_preserved() -> None:
    user = LocalUser(
        username="analyst",
        fullname="CLL Analyst",
        roles=("lymphotrack",),
        email="analyst@example.test",
        password_hash=generate_password_hash("correct horse", method="pbkdf2:sha256"),
        allowed_login_methods=("local",),
    )
    service = AuthenticationService(UserRepository(user), {"local": LocalAuthenticator()})

    authenticated = service.authenticate("local", "analyst", "correct horse")

    assert authenticated is user
    assert authenticated.is_lymphotrack
    assert authenticated.fullname == "CLL Analyst"


def test_local_login_rejects_wrong_password() -> None:
    user = LocalUser(
        username="analyst",
        fullname="CLL Analyst",
        roles=("lymphotrack",),
        email=None,
        password_hash=generate_password_hash("correct horse", method="pbkdf2:sha256"),
        allowed_login_methods=("local",),
    )
    service = AuthenticationService(UserRepository(user), {"local": LocalAuthenticator()})

    with pytest.raises(AuthenticationFailed):
        service.authenticate("local", "analyst", "wrong")


def test_ldap_provider_still_returns_the_local_user_object() -> None:
    user = LocalUser(
        username="directory-user",
        fullname="Local Display Name",
        roles=("lymphotrack_admin",),
        email="local-profile@example.test",
        password_hash=None,
    )

    class SuccessfulLdap:
        def authenticate(self, local_user: LocalUser, password: str) -> None:
            assert local_user is user
            assert password == "directory-password"

    service = AuthenticationService(UserRepository(user), {"ldap": SuccessfulLdap()})

    authenticated = service.authenticate(
        "ldap", "local-profile@example.test", "directory-password"
    )

    assert authenticated is user
    assert authenticated.is_admin
    assert authenticated.email == "local-profile@example.test"


def test_roles_from_mongo_are_normalized_for_authorization() -> None:
    user = LocalUser.from_document(
        {
            "username": "admin-user",
            "fullname": "Admin User",
            "roles": [" Admin ", "USER"],
        }
    )

    assert user.roles == ("admin", "user")
    assert user.is_admin
