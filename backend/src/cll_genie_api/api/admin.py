import re
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pymongo.errors import DuplicateKeyError
from werkzeug.security import generate_password_hash

from cll_genie_api.api.common import serialize
from cll_genie_api.api.dependencies import (
    Services,
    assert_role,
    get_current_session,
    get_services,
    record_audit,
    require_csrf,
)
from cll_genie_api.api.schemas import RuleRequest, UserCreateRequest, UserUpdateRequest
from cll_genie_api.domain.identity import Session
from cll_genie_api.reporting.rules import RuleValidationError, evaluate

router = APIRouter(prefix="/admin", tags=["administration"])


@router.get("/audit-logs")
def list_audit_logs(
    session: Annotated[Session, Depends(get_current_session)],
    services: Annotated[Services, Depends(get_services)],
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    page: Annotated[int, Query(ge=1)] = 1,
    severity: Annotated[str | None, Query()] = None,
    category: Annotated[str | None, Query()] = None,
    outcome: Annotated[str | None, Query()] = None,
    actor: Annotated[str | None, Query(max_length=100)] = None,
    search: Annotated[str | None, Query(max_length=100)] = None,
    from_time: Annotated[datetime | None, Query(alias="from")] = None,
    to_time: Annotated[datetime | None, Query(alias="to")] = None,
):
    """Return filterable, newest-first audit events from MongoDB."""
    assert_role(session, ["admin", "lymphotrack_admin"])
    query: dict = {}
    if severity:
        if severity not in {"info", "warning", "error", "critical"}:
            raise HTTPException(status_code=422, detail="Invalid audit severity")
        query["severity"] = severity
    if category:
        query["category"] = category.strip().lower()
    if outcome:
        if outcome not in {"success", "failure", "denied"}:
            raise HTTPException(status_code=422, detail="Invalid audit outcome")
        query["outcome"] = outcome
    if actor:
        query["actor.username"] = {
            "$regex": re.escape(actor.strip()),
            "$options": "i",
        }
    if search:
        term = {"$regex": re.escape(search.strip()), "$options": "i"}
        query["$or"] = [
            {"message": term},
            {"event_type": term},
            {"resource.id": term},
            {"resource.name": term},
            {"tags": term},
        ]
    if from_time or to_time:
        time_filter: dict = {}
        normalized_from = (
            from_time
            if from_time and from_time.tzinfo
            else from_time.replace(tzinfo=UTC)
            if from_time
            else None
        )
        normalized_to = (
            to_time
            if to_time and to_time.tzinfo
            else to_time.replace(tzinfo=UTC)
            if to_time
            else None
        )
        if normalized_from:
            time_filter["$gte"] = normalized_from
        if normalized_to:
            time_filter["$lte"] = normalized_to
        if normalized_from and normalized_to and normalized_from > normalized_to:
            raise HTTPException(status_code=422, detail="The audit time range is invalid")
        query["occurred_at"] = time_filter

    collection = services.collections.audit_events
    total = collection.count_documents(query)
    items = list(
        collection.find(query).sort("occurred_at", -1).skip((page - 1) * limit).limit(limit)
    )
    counts = {
        level: collection.count_documents({**query, "severity": level})
        for level in ("info", "warning", "error", "critical")
    }
    categories = sorted(collection.distinct("category"))
    return serialize(
        {
            "items": items,
            "total": total,
            "page": page,
            "page_size": limit,
            "severity_counts": counts,
            "categories": categories,
        }
    )


@router.get("/rules")
def list_rules(
    session: Annotated[Session, Depends(get_current_session)],
    services: Annotated[Services, Depends(get_services)],
):
    assert_role(session, ["admin", "lymphotrack_admin"])
    return serialize(services.rules.list())


@router.post("/rules", status_code=status.HTTP_201_CREATED)
def create_rule(
    payload: RuleRequest,
    session: Annotated[Session, Depends(require_csrf)],
    services: Annotated[Services, Depends(get_services)],
):
    assert_role(session, ["admin", "lymphotrack_admin"])
    try:
        evaluate(payload.condition, _simulation_facts())
        rule_id = services.rules.create(
            {**payload.model_dump(), "created_by": session.user.username}
        )
    except RuleValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=409, detail="Rule key and version already exist") from exc
    record_audit(
        services,
        "report_rule.created",
        f"Report rule {payload.rule_key} version {payload.version} was created",
        category="configuration",
        actor=session.user,
        provider=session.provider,
        resource_type="report_rule",
        resource_id=rule_id,
        resource_name=payload.rule_key,
        tags=["reporting", "rules", "configuration-change"],
        metadata={"version": payload.version, "status": payload.status},
    )
    return {"rule_id": rule_id}


@router.put("/rules/{rule_id}")
def update_rule(
    rule_id: str,
    payload: RuleRequest,
    session: Annotated[Session, Depends(require_csrf)],
    services: Annotated[Services, Depends(get_services)],
):
    assert_role(session, ["admin", "lymphotrack_admin"])
    try:
        evaluate(payload.condition, _simulation_facts())
    except RuleValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if not services.rules.update(rule_id, payload.model_dump()):
        raise HTTPException(status_code=404, detail="Rule not found")
    record_audit(
        services,
        "report_rule.updated",
        f"Report rule {payload.rule_key} version {payload.version} was updated",
        category="configuration",
        actor=session.user,
        provider=session.provider,
        resource_type="report_rule",
        resource_id=rule_id,
        resource_name=payload.rule_key,
        tags=["reporting", "rules", "configuration-change"],
        metadata={"version": payload.version, "status": payload.status},
    )
    return {"updated": True}


@router.post("/rules/simulate")
def simulate_rule(
    payload: RuleRequest,
    session: Annotated[Session, Depends(require_csrf)],
):
    assert_role(session, ["admin", "lymphotrack_admin"])
    facts = _simulation_facts()
    try:
        matched = evaluate(payload.condition, facts)
        text = payload.template.get("text", "").format_map(facts) if matched else ""
    except (RuleValidationError, KeyError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"matched": matched, "text": text, "facts": facts}


@router.get("/users")
def list_users(
    session: Annotated[Session, Depends(get_current_session)],
    services: Annotated[Services, Depends(get_services)],
):
    assert_role(session, ["admin", "lymphotrack_admin"])
    users = list(services.collections.users.find({}).sort("username", 1))
    for user in users:
        user["allowed_login_methods"] = user.get("allowed_login_methods", [])
        user.pop("password", None)
    return serialize(users)


@router.post("/users", status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreateRequest,
    session: Annotated[Session, Depends(require_csrf)],
    services: Annotated[Services, Depends(get_services)],
):
    assert_role(session, ["admin", "lymphotrack_admin"])
    now = datetime.now(UTC)
    document = payload.model_dump(exclude={"password"})
    document.update(
        {
            "created_at": now,
            "updated_at": now,
            "last_login": None,
            "created_by": session.user.username,
            "updated_by": session.user.username,
        }
    )
    if payload.password:
        document["password"] = generate_password_hash(payload.password, method="pbkdf2:sha256")
    try:
        result = services.collections.users.insert_one(document)
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=409, detail="Username or email already exists") from exc
    record_audit(
        services,
        "user.created",
        f"User {document['username']} was created",
        category="identity",
        actor=session.user,
        provider=session.provider,
        resource_type="user",
        resource_id=document["username"],
        resource_name=document.get("fullname"),
        tags=["user-management", "identity", "configuration-change"],
        metadata={
            "roles": document.get("roles", []),
            "enabled": document.get("enabled", True),
            "allowed_login_methods": payload.allowed_login_methods,
        },
    )
    return {"user_id": str(result.inserted_id), "username": document["username"]}


@router.patch("/users/{username}")
def update_user(
    username: str,
    payload: UserUpdateRequest,
    session: Annotated[Session, Depends(require_csrf)],
    services: Annotated[Services, Depends(get_services)],
):
    assert_role(session, ["admin", "lymphotrack_admin"])
    existing = services.collections.users.find_one({"username": username})
    if existing is None:
        raise HTTPException(status_code=404, detail="User not found")
    current_methods = existing.get("allowed_login_methods", [])
    if payload.allowed_login_methods is None and not current_methods:
        raise HTTPException(
            status_code=422,
            detail="Configure at least one allowed login method for this user",
        )
    target_methods = (
        payload.allowed_login_methods
        if payload.allowed_login_methods is not None
        else current_methods
    )
    if payload.password and "local" not in target_methods:
        raise HTTPException(status_code=422, detail="Local login is not allowed for this user")
    if "local" in target_methods and not payload.password and not existing.get("password"):
        raise HTTPException(
            status_code=422,
            detail="Set a password when enabling local login",
        )

    values = payload.model_dump(exclude_none=True, exclude={"password"})
    if payload.password:
        values["password"] = generate_password_hash(payload.password, method="pbkdf2:sha256")
    if not values:
        return {"updated": False}
    values.update({"updated_at": datetime.now(UTC), "updated_by": session.user.username})
    update_document: dict = {"$set": values}
    if "local" not in target_methods and existing.get("password"):
        update_document["$unset"] = {"password": ""}
    try:
        services.collections.users.update_one({"username": username}, update_document)
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=409, detail="Email already exists") from exc
    changed_fields = sorted(
        key for key in values if key not in {"updated_at", "updated_by", "password"}
    )
    if payload.password:
        changed_fields.append("password")
    if "local" not in target_methods and existing.get("password"):
        changed_fields.append("password_removed")
    record_audit(
        services,
        "user.updated",
        f"Local user {username} was updated",
        severity="warning" if "roles" in changed_fields or "enabled" in changed_fields else "info",
        category="identity",
        actor=session.user,
        provider=session.provider,
        resource_type="user",
        resource_id=username,
        tags=["user-management", "identity", "configuration-change"],
        metadata={
            "changed_fields": changed_fields,
            "allowed_login_methods": target_methods,
        },
    )
    return {"updated": True}


def _simulation_facts() -> dict:
    return {
        "sequence_count": 1,
        "sequence_word": "en",
        "sequence_table": "Seq1",
        "all_productive": True,
        "any_stop_codon": False,
        "identities": [97.59],
        "identities_percent": "97.59%",
        "mutation_statuses": ["Borderline"],
        "combined_mutation_status": "Borderline",
        "subset_ids": [],
        "subset_count": 0,
        "subset_conflict": False,
        "sequences": [],
    }
