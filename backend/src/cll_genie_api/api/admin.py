from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pymongo.errors import DuplicateKeyError
from werkzeug.security import generate_password_hash

from cll_genie_api.api.common import serialize
from cll_genie_api.api.dependencies import (
    Services,
    assert_permission,
    get_current_session,
    get_services,
    require_csrf,
)
from cll_genie_api.api.schemas import RuleRequest, UserCreateRequest, UserUpdateRequest
from cll_genie_api.domain.identity import Session
from cll_genie_api.reporting.rules import RuleValidationError, evaluate

router = APIRouter(prefix="/admin", tags=["administration"])


@router.get("/rules")
def list_rules(
    session: Annotated[Session, Depends(get_current_session)],
    services: Annotated[Services, Depends(get_services)],
):
    assert_permission(session, "rules:manage")
    return serialize(services.rules.list())


@router.post("/rules", status_code=status.HTTP_201_CREATED)
def create_rule(
    payload: RuleRequest,
    session: Annotated[Session, Depends(require_csrf)],
    services: Annotated[Services, Depends(get_services)],
):
    assert_permission(session, "rules:manage")
    try:
        evaluate(payload.condition, _simulation_facts())
        rule_id = services.rules.create(
            {**payload.model_dump(), "created_by": session.user.username}
        )
    except RuleValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=409, detail="Rule key and version already exist") from exc
    services.audit.record(
        session.user.username,
        "report_rule.created",
        f"rule:{rule_id}",
        {"rule_key": payload.rule_key, "version": payload.version, "status": payload.status},
    )
    return {"rule_id": rule_id}


@router.put("/rules/{rule_id}")
def update_rule(
    rule_id: str,
    payload: RuleRequest,
    session: Annotated[Session, Depends(require_csrf)],
    services: Annotated[Services, Depends(get_services)],
):
    assert_permission(session, "rules:manage")
    try:
        evaluate(payload.condition, _simulation_facts())
    except RuleValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if not services.rules.update(rule_id, payload.model_dump()):
        raise HTTPException(status_code=404, detail="Rule not found")
    services.audit.record(
        session.user.username,
        "report_rule.updated",
        f"rule:{rule_id}",
        {"rule_key": payload.rule_key, "version": payload.version, "status": payload.status},
    )
    return {"updated": True}


@router.post("/rules/simulate")
def simulate_rule(
    payload: RuleRequest,
    session: Annotated[Session, Depends(require_csrf)],
):
    assert_permission(session, "rules:manage")
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
    assert_permission(session, "users:manage")
    users = list(services.collections.users.find({}, {"password": 0}).sort("_id", 1))
    return serialize(users)


@router.post("/users", status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreateRequest,
    session: Annotated[Session, Depends(require_csrf)],
    services: Annotated[Services, Depends(get_services)],
):
    assert_permission(session, "users:manage")
    document = payload.model_dump(exclude={"password"})
    document["_id"] = document.pop("username")
    if payload.password:
        document["password"] = generate_password_hash(payload.password, method="pbkdf2:sha256")
    try:
        services.collections.users.insert_one(document)
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=409, detail="User already exists") from exc
    services.audit.record(
        session.user.username,
        "user.created",
        f"user:{document['_id']}",
        {"roles": document.get("roles", []), "groups": document.get("groups", []), "enabled": document.get("enabled", True)},
    )
    return {"username": document["_id"]}


@router.patch("/users/{username}")
def update_user(
    username: str,
    payload: UserUpdateRequest,
    session: Annotated[Session, Depends(require_csrf)],
    services: Annotated[Services, Depends(get_services)],
):
    assert_permission(session, "users:manage")
    values = payload.model_dump(exclude_none=True, exclude={"password"})
    if payload.password:
        values["password"] = generate_password_hash(payload.password, method="pbkdf2:sha256")
    if not values:
        return {"updated": False}
    result = services.collections.users.update_one({"_id": username}, {"$set": values})
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="User not found")
    services.audit.record(
        session.user.username,
        "user.updated",
        f"user:{username}",
        {"fields": sorted(values)},
    )
    return {"updated": True}


@router.get("/audit")
def audit_events(
    session: Annotated[Session, Depends(get_current_session)],
    services: Annotated[Services, Depends(get_services)],
    limit: int = Query(default=100, ge=1, le=500),
):
    assert_permission(session, "users:manage")
    return serialize(services.audit.list(limit))


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
