from types import SimpleNamespace

import pytest
from bson import ObjectId

from cll_genie_api.config import Settings
from cll_genie_api.domain.identity import LocalUser
from cll_genie_api.infrastructure import authentication
from cll_genie_api.infrastructure.authentication import AuthenticationFailed, LdapAuthenticator
from cll_genie_api.infrastructure.users import MongoUserRepository


def ldap_settings(**overrides) -> Settings:
    values = {
        "auth_providers": ["ldap"],
        "ldap_host": "ldap://ldap.example.test",
        "ldap_base_dn": "dc=example,dc=test",
        "ldap_user_login_attr": "mail",
        "ldap_use_ssl": False,
        "ldap_use_tls": True,
        "ldap_binddn": "cn=service,dc=example,dc=test",
        "ldap_secret": "service-password",
        "ldap_user_dn": "ou=people",
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


def directory_user() -> LocalUser:
    return LocalUser(
        username="user-id",
        fullname="Directory User",
        roles=("user",),
        email="user@example.test",
        password_hash=None,
    )


def test_ldap_authentication_uses_coyote_search_settings(monkeypatch) -> None:
    server_arguments = {}
    connection_arguments = []
    search_arguments = {}
    tls_arguments = {}

    def fake_tls(**kwargs):
        tls_arguments.update(kwargs)
        return object()

    def fake_server(host, **kwargs):
        server_arguments.update({"host": host, **kwargs})
        return object()

    class FakeConnection:
        def __init__(self, server, **kwargs) -> None:
            self.entries = []
            connection_arguments.append(kwargs)

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, traceback) -> None:
            return None

        def search(self, base, search_filter, **kwargs) -> bool:
            search_arguments.update({"base": base, "filter": search_filter, **kwargs})
            self.entries = [
                SimpleNamespace(entry_dn="mail=user@example.test,ou=people,dc=example,dc=test")
            ]
            return True

    monkeypatch.setattr(authentication, "Server", fake_server)
    monkeypatch.setattr(authentication, "Connection", FakeConnection)
    monkeypatch.setattr(authentication, "Tls", fake_tls)

    LdapAuthenticator(ldap_settings()).authenticate(directory_user(), "user-password")

    assert server_arguments["host"] == "ldap.example.test"
    assert server_arguments["port"] == 389
    assert server_arguments["use_ssl"] is False
    assert tls_arguments["validate"] == authentication.ssl.CERT_REQUIRED
    assert search_arguments["base"] == "ou=people,dc=example,dc=test"
    assert search_arguments["filter"] == "(mail=user@example.test)"
    assert connection_arguments[0]["user"] == "cn=service,dc=example,dc=test"
    assert connection_arguments[0]["password"] == "service-password"
    assert connection_arguments[0]["auto_bind"] == authentication.AUTO_BIND_TLS_BEFORE_BIND
    assert connection_arguments[1]["user"] == (
        "mail=user@example.test,ou=people,dc=example,dc=test"
    )
    assert connection_arguments[1]["password"] == "user-password"


def test_ldap_certificate_validation_can_be_disabled_explicitly(monkeypatch) -> None:
    tls_arguments = {}

    def fake_tls(**kwargs):
        tls_arguments.update(kwargs)
        return object()

    class FakeConnection:
        def __init__(self, _server, **_kwargs) -> None:
            self.entries = [SimpleNamespace(entry_dn="mail=user@example.test,dc=example,dc=test")]

        def __enter__(self):
            return self

        def __exit__(self, _exc_type, _exc, _traceback) -> None:
            return None

        def search(self, *_args, **_kwargs) -> bool:
            return True

    monkeypatch.setattr(authentication, "Tls", fake_tls)
    monkeypatch.setattr(authentication, "Server", lambda *_args, **_kwargs: object())
    monkeypatch.setattr(authentication, "Connection", FakeConnection)

    LdapAuthenticator(ldap_settings(ldap_tls_validate=False)).authenticate(
        directory_user(), "user-password"
    )

    assert tls_arguments["validate"] == authentication.ssl.CERT_NONE


def test_ldap_rejects_simultaneous_ssl_and_starttls() -> None:
    authenticator = LdapAuthenticator(
        ldap_settings(
            ldap_host="ldaps://ldap.example.test",
            ldap_use_ssl=True,
            ldap_use_tls=True,
        )
    )

    with pytest.raises(AuthenticationFailed):
        authenticator.authenticate(directory_user(), "user-password")


def test_local_object_id_user_records_can_be_loaded_by_email() -> None:
    document = {
        "_id": ObjectId("507f1f77bcf86cd799439011"),
        "username": "directory-user",
        "email": "user@example.test",
        "fullname": "Directory User",
        "roles": ["user"],
        "enabled": True,
    }

    class Collection:
        def find_one(self, query):
            assert query == {
                "$or": [
                    {"username": "user@example.test"},
                    {"email": "user@example.test"},
                ]
            }
            return document

    user = MongoUserRepository(Collection()).get("user@example.test")

    assert user is not None
    assert user.username == "directory-user"
    assert user.email == "user@example.test"
    assert user.roles == ("user",)
    assert user.enabled is True
