from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class LocalUser:
    """Application identity loaded from the CLL Genie users collection."""

    username: str
    fullname: str
    roles: tuple[str, ...]
    email: str | None
    password_hash: str | None
    allowed_login_methods: tuple[str, ...] = ("ldap",)
    enabled: bool = True

    @property
    def has_valid_roles(self) -> bool:
        supported_roles = {"admin", "lymphotrack_admin", "user"}
        return bool(self.roles) and set(self.roles) <= supported_roles

    @classmethod
    def from_document(cls, document: dict[str, Any]) -> "LocalUser":
        username = str(document["username"])
        fullname = str(document.get("fullname") or username)
        roles = tuple(
            normalized
            for role in document.get("roles", [])
            if (normalized := str(role).strip().lower())
        )
        return cls(
            username=username,
            fullname=fullname,
            roles=roles,
            email=document.get("email"),
            password_hash=document.get("password"),
            allowed_login_methods=tuple(
                method
                for method in ("ldap", "local")
                if method in document.get("allowed_login_methods", [])
            ),
            enabled=bool(document.get("enabled", True)),
        )

    @property
    def is_admin(self) -> bool:
        return self.has_valid_roles and "admin" in self.roles

    @property
    def can_analyze(self) -> bool:
        return self.has_valid_roles

    @property
    def can_moderate(self) -> bool:
        return self.has_valid_roles and bool(
            {"admin", "lymphotrack_admin"} & set(self.roles)
        )


@dataclass(frozen=True, slots=True)
class Session:
    """The verified identity and context of a request."""

    token_id: str
    csrf_token: str
    user: LocalUser
    provider: str
