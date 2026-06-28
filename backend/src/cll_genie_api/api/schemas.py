from typing import Literal

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    provider: Literal["local", "ldap"]
    username: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=1, max_length=1024)


class UserResponse(BaseModel):
    username: str
    fullname: str
    email: str | None
    roles: list[str]
    groups: list[str]
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
    email: str | None = None
    roles: list[str] = Field(default_factory=list)
    groups: list[str] = Field(default_factory=list)
    password: str | None = Field(default=None, min_length=8, max_length=1024)
    enabled: bool = True


class UserUpdateRequest(BaseModel):
    fullname: str | None = Field(default=None, min_length=1, max_length=300)
    email: str | None = None
    roles: list[str] | None = None
    groups: list[str] | None = None
    password: str | None = Field(default=None, min_length=8, max_length=1024)
    enabled: bool | None = None


class UserSettingsRequest(BaseModel):
    fullname: str | None = Field(default=None, min_length=1, max_length=300)
    password: str | None = Field(default=None, min_length=8, max_length=1024)


def user_response(user) -> UserResponse:
    return UserResponse(
        username=user.username,
        fullname=user.fullname,
        email=user.email,
        roles=list(user.roles),
        groups=list(user.groups),
        is_admin=user.is_admin,
        is_lymphotrack=user.is_lymphotrack,
    )
