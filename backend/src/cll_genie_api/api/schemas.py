from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

USER_ROLES = {"admin", "lymphotrack_admin", "lymphotrack"}


class LoginRequest(BaseModel):
    provider: Literal["local", "ldap"]
    username: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=1, max_length=1024)


class UserResponse(BaseModel):
    username: str
    fullname: str
    email: str | None
    roles: list[str]
    is_admin: bool
    is_lymphotrack: bool


class SessionResponse(BaseModel):
    user: UserResponse
    provider: str
    csrf_token: str


class ProviderResponse(BaseModel):
    id: Literal["local", "ldap"]
    label: str


class ProvidersResponse(BaseModel):
    providers: list[ProviderResponse]
    version: str
    environment: str


class MessageResponse(BaseModel):
    message: str


class HealthResponse(BaseModel):
    status: str
    version: str


class SystemStatusResponse(BaseModel):
    api: str
    database: str
    imgt: str
    redis: str
    celery: str
    worker: str
    scheduler: str
    version: str


class PreviewSequencesRequest(BaseModel):
    sheet_name: str = "Merged Read Summary"
    header_row: int = Field(default=4, ge=0, le=99)
    minimum_reads_percent: float = Field(default=0, ge=0, le=100)
    in_frame: Literal["Y", "N", "B"] = "B"
    no_stop_codon: Literal["Y", "N", "B"] = "B"
    artifact_id: str | None = None


class VquestSubmitRequest(BaseModel):
    sequences: list[dict] = Field(min_length=1, max_length=50)
    options: dict = Field(default_factory=dict)


class CommentRequest(BaseModel):
    text: str = Field(min_length=1, max_length=20_000)


class CommentStatusRequest(BaseModel):
    hidden: bool


class ReportGenerateRequest(BaseModel):
    summary: str = Field(min_length=1, max_length=50_000)


class RuleRequest(BaseModel):
    rule_key: str = Field(min_length=3, max_length=200)
    version: int = Field(ge=1)
    status: Literal["DRAFT", "ACTIVE", "RETIRED"] = "DRAFT"
    report_type: str = "CLL_IGHV"
    language: str = "sv-SE"
    section: str
    priority: int = Field(ge=0, le=10_000)
    exclusive_group: str | None = None
    condition: dict
    template: dict
    metadata: dict = Field(default_factory=dict)


class UserCreateRequest(BaseModel):
    username: str = Field(min_length=1, max_length=128)
    fullname: str = Field(min_length=1, max_length=300)
    firstname: str = Field(min_length=1, max_length=150)
    lastname: str = Field(min_length=1, max_length=150)
    email: str = Field(min_length=1, max_length=320)
    roles: list[str] = Field(min_length=1)
    allowed_login_methods: list[Literal["ldap", "local"]] = Field(min_length=1)
    password: str | None = Field(default=None, min_length=8, max_length=1024)
    enabled: bool = True

    @field_validator("roles")
    @classmethod
    def normalize_roles(cls, roles: list[str]) -> list[str]:
        normalized = {role.strip().lower() for role in roles if role.strip()}
        unsupported = normalized - USER_ROLES
        if unsupported:
            raise ValueError(f"Unsupported roles: {', '.join(sorted(unsupported))}")
        if not normalized:
            raise ValueError("At least one role is required")
        return sorted(normalized)

    @field_validator("allowed_login_methods")
    @classmethod
    def normalize_login_methods(cls, methods: list[str]) -> list[str]:
        normalized = {method.strip().lower() for method in methods if method.strip()}
        if not normalized:
            raise ValueError("At least one login method is required")
        return [method for method in ("ldap", "local") if method in normalized]

    @model_validator(mode="after")
    def validate_login_methods_and_password(self):
        if "local" in self.allowed_login_methods and not self.password:
            raise ValueError("A password is required when local login is allowed")
        if "local" not in self.allowed_login_methods and self.password:
            raise ValueError("A local password requires local login to be allowed")
        return self


class UserUpdateRequest(BaseModel):
    fullname: str | None = Field(default=None, min_length=1, max_length=300)
    firstname: str | None = Field(default=None, min_length=1, max_length=150)
    lastname: str | None = Field(default=None, min_length=1, max_length=150)
    email: str | None = None
    roles: list[str] | None = None
    allowed_login_methods: list[Literal["ldap", "local"]] | None = None
    password: str | None = Field(default=None, min_length=8, max_length=1024)
    enabled: bool | None = None

    @field_validator("roles")
    @classmethod
    def normalize_roles(cls, roles: list[str] | None) -> list[str] | None:
        if roles is None:
            return None
        normalized = {role.strip().lower() for role in roles if role.strip()}
        unsupported = normalized - USER_ROLES
        if unsupported:
            raise ValueError(f"Unsupported roles: {', '.join(sorted(unsupported))}")
        if not normalized:
            raise ValueError("At least one role is required")
        return sorted(normalized)

    @field_validator("allowed_login_methods")
    @classmethod
    def normalize_login_methods(cls, methods: list[str] | None) -> list[str] | None:
        if methods is None:
            return None
        normalized = {method.strip().lower() for method in methods if method.strip()}
        if not normalized:
            raise ValueError("At least one login method is required")
        return [method for method in ("ldap", "local") if method in normalized]

    @model_validator(mode="after")
    def validate_login_methods_and_password(self):
        if (
            self.allowed_login_methods is not None
            and "local" not in self.allowed_login_methods
            and self.password
        ):
            raise ValueError("A local password requires local login to be allowed")
        return self


class UserSettingsRequest(BaseModel):
    fullname: str | None = Field(default=None, min_length=1, max_length=300)
    password: str | None = Field(default=None, min_length=8, max_length=1024)


def user_response(user) -> UserResponse:
    return UserResponse(
        username=user.username,
        fullname=user.fullname,
        email=user.email,
        roles=list(user.roles),
        is_admin=user.is_admin,
        is_lymphotrack=user.is_lymphotrack,
    )
