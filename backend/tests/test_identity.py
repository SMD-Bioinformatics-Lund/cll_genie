import pytest
from werkzeug.security import generate_password_hash

from cll_genie_api.api.submissions import visible_submission
from cll_genie_api.domain.identity import LocalUser, Session
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
            self.user if self.user and username in {self.user.username, self.user.email} else None
        )


def test_existing_werkzeug_password_and_local_profile_are_preserved() -> None:
    user = LocalUser(
        username="analyst",
        fullname="CLL Analyst",
        roles=("user",),
        email="analyst@example.test",
        password_hash=generate_password_hash("correct horse", method="pbkdf2:sha256"),
        allowed_login_methods=("local",),
    )
    service = AuthenticationService(UserRepository(user), {"local": LocalAuthenticator()})

    authenticated = service.authenticate("local", "analyst", "correct horse")

    assert authenticated is user
    assert authenticated.can_analyze
    assert authenticated.fullname == "CLL Analyst"


def test_local_login_rejects_wrong_password() -> None:
    user = LocalUser(
        username="analyst",
        fullname="CLL Analyst",
        roles=("user",),
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

    authenticated = service.authenticate("ldap", "local-profile@example.test", "directory-password")

    assert authenticated is user
    assert not authenticated.is_admin
    assert authenticated.can_moderate
    assert authenticated.email == "local-profile@example.test"


def test_multiple_roles_from_mongo_grant_additive_permissions() -> None:
    user = LocalUser.from_document(
        {
            "username": "admin-user",
            "fullname": "Admin User",
            "roles": [" Admin ", "USER"],
        }
    )

    assert user.roles == ("admin", "user")
    assert user.has_valid_roles
    assert user.is_admin
    assert user.can_analyze
    assert user.can_moderate


def test_hidden_comments_are_visible_only_to_clinical_moderators() -> None:
    submission = {
        "submission_comments": [
            {"id": "visible", "text": "Visible", "hidden": False},
            {"id": "hidden", "text": "Sensitive", "hidden": True},
        ]
    }
    user = LocalUser("user", "User", ("user",), None, None)
    moderator = LocalUser("moderator", "Moderator", ("lymphotrack_admin",), None, None)

    visible = visible_submission(submission, Session("token", "csrf", user, "ldap"))
    moderated = visible_submission(submission, Session("token", "csrf", moderator, "ldap"))

    assert [comment["id"] for comment in visible["submission_comments"]] == ["visible"]
    assert len(moderated["submission_comments"]) == 2
