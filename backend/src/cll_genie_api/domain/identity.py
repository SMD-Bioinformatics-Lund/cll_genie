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
    enabled: bool = True

    @classmethod
    def from_document(cls, document: dict[str, Any]) -> "LocalUser":
        username = str(document["username"])
        fullname = str(document.get("fullname") or username)
        roles = tuple(str(role) for role in document.get("roles", []))
        return cls(
            username=username,
            fullname=fullname,
            roles=roles,
            email=document.get("email"),
            password_hash=document.get("password"),
            enabled=bool(document.get("enabled", True)),
        )

    @property
    def is_admin(self) -> bool:
        admin_roles = {"admin", "lymphotrack_admin"}
        return bool(admin_roles.intersection(self.roles))

    @property
    def is_lymphotrack(self) -> bool:
        lymphotrack_roles = {"lymphotrack", "lymphotrack_admin"}
        return bool(lymphotrack_roles.intersection(self.roles))


@dataclass(frozen=True, slots=True)
class Session:
    """The verified identity and context of a request."""

    token_id: str
    csrf_token: str
    user: LocalUser
    provider: str
