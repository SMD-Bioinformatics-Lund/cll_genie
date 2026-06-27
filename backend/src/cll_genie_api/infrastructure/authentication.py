import ssl
from dataclasses import dataclass
from urllib.parse import urlparse

from ldap3 import ALL, AUTO_BIND_NO_TLS, AUTO_BIND_TLS_BEFORE_BIND, SUBTREE, Connection, Server, Tls
from ldap3.core.exceptions import LDAPException
from ldap3.utils.conv import escape_filter_chars
from werkzeug.security import check_password_hash

from cll_genie_api.config import Settings
from cll_genie_api.domain.identity import LocalUser


class AuthenticationFailed(Exception):
    """Credentials were invalid or the provider was unavailable."""


class LocalAuthenticator:
    name = "local"

    def authenticate(self, user: LocalUser, password: str) -> None:
        if not user.password_hash or not check_password_hash(user.password_hash, password):
            raise AuthenticationFailed


@dataclass(slots=True)
class LdapAuthenticator:
    settings: Settings
    name: str = "ldap"

    def authenticate(self, user: LocalUser, password: str) -> None:
        if not self.settings.ldap_is_configured():
            raise AuthenticationFailed

        assert self.settings.ldap_uri is not None
        assert self.settings.ldap_base_dn is not None
        parsed = urlparse(self.settings.ldap_uri)
        use_ssl = parsed.scheme.lower() == "ldaps"
        host = parsed.hostname
        if not host or parsed.scheme.lower() not in {"ldap", "ldaps"}:
            raise AuthenticationFailed

        port = parsed.port or (636 if use_ssl else 389)
        tls = Tls(validate=ssl.CERT_REQUIRED)
        auto_bind = AUTO_BIND_NO_TLS if use_ssl else AUTO_BIND_TLS_BEFORE_BIND
        server = Server(
            host,
            port=port,
            use_ssl=use_ssl,
            tls=tls,
            get_info=ALL,
            connect_timeout=self.settings.ldap_connect_timeout_seconds,
        )

        escaped_username = escape_filter_chars(user.username)
        search_filter = self.settings.ldap_user_filter.replace("{username}", escaped_username)

        try:
            with Connection(
                server,
                user=self.settings.ldap_bind_dn,
                password=self.settings.ldap_bind_password,
                auto_bind=auto_bind,
                raise_exceptions=True,
                receive_timeout=self.settings.ldap_connect_timeout_seconds,
            ) as search_connection:
                found = search_connection.search(
                    self.settings.ldap_base_dn,
                    search_filter,
                    search_scope=SUBTREE,
                    attributes=[],
                    size_limit=2,
                )
                if not found or len(search_connection.entries) != 1:
                    raise AuthenticationFailed
                user_dn = search_connection.entries[0].entry_dn

            with Connection(
                server,
                user=user_dn,
                password=password,
                auto_bind=auto_bind,
                raise_exceptions=True,
                receive_timeout=self.settings.ldap_connect_timeout_seconds,
            ):
                return
        except (LDAPException, OSError, ValueError) as exc:
            raise AuthenticationFailed from exc


class AuthenticationService:
    def __init__(self, user_repository, authenticators: dict[str, object]) -> None:
        self.user_repository = user_repository
        self.authenticators = authenticators

    def authenticate(self, provider: str, username: str, password: str) -> LocalUser:
        username = username.strip()
        user = self.user_repository.get(username)
        authenticator = self.authenticators.get(provider)
        if user is None or not user.enabled or authenticator is None:
            raise AuthenticationFailed
        authenticator.authenticate(user, password)
        return user
