import logging
import ssl
import struct
from dataclasses import dataclass
from urllib.parse import urlparse

from ldap3 import ALL, AUTO_BIND_NO_TLS, AUTO_BIND_TLS_BEFORE_BIND, SUBTREE, Connection, Server, Tls
from ldap3.core.exceptions import LDAPException
from ldap3.utils.conv import escape_filter_chars
from werkzeug.security import check_password_hash

from cll_genie_api.config import Settings
from cll_genie_api.domain.identity import LocalUser

LOG = logging.getLogger(__name__)


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

        assert self.settings.ldap_host is not None
        assert self.settings.ldap_base_dn is not None
        if self.settings.ldap_use_ssl and self.settings.ldap_use_tls:
            raise AuthenticationFailed

        parsed = urlparse(self.settings.ldap_host)
        scheme = parsed.scheme.lower()
        host = parsed.hostname
        expected_scheme = "ldaps" if self.settings.ldap_use_ssl else "ldap"
        if not host or scheme != expected_scheme:
            raise AuthenticationFailed

        port = parsed.port or (636 if self.settings.ldap_use_ssl else 389)
        tls = Tls(
            validate=(ssl.CERT_REQUIRED if self.settings.ldap_tls_validate else ssl.CERT_NONE)
        )
        auto_bind = AUTO_BIND_TLS_BEFORE_BIND if self.settings.ldap_use_tls else AUTO_BIND_NO_TLS
        server = Server(
            host,
            port=port,
            use_ssl=self.settings.ldap_use_ssl,
            tls=tls,
            get_info=ALL,
            connect_timeout=self.settings.ldap_connect_timeout_seconds,
        )

        login_value = (
            user.email
            if self.settings.ldap_user_login_attr.lower() == "mail" and user.email
            else user.username
        )
        escaped_login = escape_filter_chars(login_value)
        search_filter = f"({self.settings.ldap_user_login_attr}={escaped_login})"
        search_base = self.settings.ldap_base_dn.strip(", ")
        if self.settings.ldap_user_dn:
            user_dn = self.settings.ldap_user_dn.strip(", ")
            if not user_dn.lower().endswith(search_base.lower()):
                search_base = f"{user_dn},{search_base}"
            else:
                search_base = user_dn

        try:
            with Connection(
                server,
                user=self.settings.ldap_binddn,
                password=self.settings.ldap_secret,
                auto_bind=auto_bind,
                raise_exceptions=True,
                receive_timeout=self.settings.ldap_connect_timeout_seconds,
            ) as search_connection:
                found = search_connection.search(
                    search_base,
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
        except (LDAPException, OSError, ValueError, struct.error) as exc:
            LOG.warning(
                "LDAP authentication failed during directory connection, search, or bind",
                extra={"ldap_error_type": type(exc).__name__},
            )
            raise AuthenticationFailed from exc


class AuthenticationService:
    def __init__(self, user_repository, authenticators: dict[str, object]) -> None:
        self.user_repository = user_repository
        self.authenticators = authenticators

    def authenticate(self, provider: str, username: str, password: str) -> LocalUser:
        username = username.strip()
        user = self.user_repository.get(username)
        authenticator = self.authenticators.get(provider)
        if (
            user is None
            or not user.enabled
            or not user.has_valid_roles
            or authenticator is None
            or provider not in user.allowed_login_methods
        ):
            raise AuthenticationFailed
        authenticator.authenticate(user, password)
        return user
