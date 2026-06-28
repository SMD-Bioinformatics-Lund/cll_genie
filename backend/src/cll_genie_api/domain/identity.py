from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class LocalUser:
    """Application identity loaded from the existing coyote.users document."""

    username: str
    fullname: str
    roles: tuple[str, ...]
    groups: tuple[str, ...]
    email: str | None
    password_hash: str | None
    enabled: bool = True

    @classmethod
    def from_document(cls, document: dict[str, Any]) -> "LocalUser":
        username = str(document["_id"])
        fullname = str(document.get("fullname") or username)
        roles = tuple(str(role) for role in document.get("roles", []))
        groups = tuple(str(group) for group in document.get("groups", []))
        return cls(
            username=username,
            fullname=fullname,
            roles=roles,
            groups=groups,
            email=document.get("email"),
            password_hash=document.get("password"),
            enabled=bool(document.get("enabled", True)),
        )

    @property
    def is_admin(self) -> bool:
        return bool({"admin", "lymphotrack_admin"}.intersection(self.roles) or {"admin", "lymphotrack_admin"}.intersection(self.groups))

    @property
    def is_lymphotrack(self) -> bool:
        return bool({"lymphotrack", "lymphotrack_admin"}.intersection(self.roles) or {"lymphotrack", "lymphotrack_admin"}.intersection(self.groups))


@dataclass(frozen=True, slots=True)
class Session:
    """The verified identity and context of a request."""

    token_id: str
    csrf_token: str
    user: LocalUser
    provider: str
