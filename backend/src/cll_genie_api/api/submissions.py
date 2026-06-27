from pathlib import Path
from typing import Annotated

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse

from cll_genie_api.api.common import serialize
from cll_genie_api.api.dependencies import (
    Services,
    assert_permission,
    get_current_session,
    get_services,
    require_csrf,
)
from cll_genie_api.api.schemas import CommentRequest, CommentStatusRequest, VquestSubmitRequest
from cll_genie_api.domain.identity import Session
from cll_genie_api.infrastructure.repositories import utcnow
from cll_genie_api.tasks import run_vquest

router = APIRouter(tags=["submissions"])


def visible_submission(submission: dict, session: Session) -> dict:
    if "results:delete" in session.user.permissions:
        return submission
    return {
        **submission,
        "submission_comments": [
            comment
            for comment in submission.get("submission_comments", [])
            if not comment.get("hidden")
        ],
    }


@router.post("/samples/{sample_id}/submit-vquest", status_code=status.HTTP_202_ACCEPTED)
def submit_vquest(
    sample_id: str,
    payload: VquestSubmitRequest,
    session: Annotated[Session, Depends(require_csrf)],
    services: Annotated[Services, Depends(get_services)],
):
    assert_permission(session, "analysis:create")
    if not payload.sequences:
        raise HTTPException(status_code=422, detail="No sequences provided")
    
    job_id = services.jobs.create(
        "VQUEST",
        sample_id,
        {"sequence_count": len(payload.sequences), "options": payload.options},
        session.user.username,
    )
    run_vquest.delay(job_id, sample_id, payload.sequences, payload.options, session.user.username)
    return {"job_id": job_id}


@router.get("/samples/{sample_id}/submissions")
def list_submissions(
    sample_id: str,
    session: Annotated[Session, Depends(get_current_session)],
    services: Annotated[Services, Depends(get_services)],
):
    document = services.vquest.get(sample_id)
    results = {
        key: visible_submission(value, session)
        for key, value in (document or {}).get("results", {}).items()
    }
    return serialize(results)


@router.get("/samples/{sample_id}/submissions/{submission_id}")
def get_submission(
    sample_id: str,
    submission_id: str,
    session: Annotated[Session, Depends(get_current_session)],
    services: Annotated[Services, Depends(get_services)],
):
    submission = services.vquest.get_submission(sample_id, submission_id)
    if submission is None:
        raise HTTPException(status_code=404, detail="Submission not found")
    return serialize(visible_submission(submission, session))


@router.get("/samples/{sample_id}/submissions/{submission_id}/zip")
def download_submission_zip(
    sample_id: str,
    submission_id: str,
    session: Annotated[Session, Depends(get_current_session)],
    services: Annotated[Services, Depends(get_services)],
):
    del session
    submission = services.vquest.get_submission(sample_id, submission_id)
    if submission is None:
        raise HTTPException(status_code=404, detail="Submission not found")
    path = Path(submission.get("results_zip_file", ""))
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Result ZIP is unavailable")
    return FileResponse(path, media_type="application/zip", filename=f"{submission_id}.zip")


@router.post("/samples/{sample_id}/submissions/{submission_id}/comments", status_code=201)
def add_comment(
    sample_id: str,
    submission_id: str,
    payload: CommentRequest,
    session: Annotated[Session, Depends(require_csrf)],
    services: Annotated[Services, Depends(get_services)],
):
    assert_permission(session, "comments:create")
    comment = {
        "id": ObjectId(),
        "text": payload.text,
        "time_created": utcnow(),
        "author": session.user.fullname,
        "hidden": False,
        "hidden_by": "",
        "time_hidden": "",
    }
    if not services.vquest.add_comment(sample_id, submission_id, comment):
        raise HTTPException(status_code=404, detail="Submission not found")
    return serialize(comment)


@router.patch("/samples/{sample_id}/submissions/{submission_id}/comments/{comment_id}")
def update_comment(
    sample_id: str,
    submission_id: str,
    comment_id: str,
    payload: CommentStatusRequest,
    session: Annotated[Session, Depends(require_csrf)],
    services: Annotated[Services, Depends(get_services)],
):
    assert_permission(session, "results:delete")
    if not services.vquest.set_comment_hidden(
        sample_id, submission_id, comment_id, payload.hidden, session.user.fullname
    ):
        raise HTTPException(status_code=404, detail="Comment not found")
    services.audit.record(
        session.user.username,
        "vquest.comment.hidden" if payload.hidden else "vquest.comment.restored",
        f"sample:{sample_id}",
        {"submission_id": submission_id, "comment_id": comment_id},
    )
    return {"updated": True}


@router.delete("/samples/{sample_id}/submissions/{submission_id}", status_code=204)
def delete_submission(
    sample_id: str,
    submission_id: str,
    session: Annotated[Session, Depends(require_csrf)],
    services: Annotated[Services, Depends(get_services)],
):
    assert_permission(session, "results:delete")
    if not services.vquest.delete_submission(sample_id, submission_id):
        raise HTTPException(status_code=404, detail="Submission not found")
    remaining = services.vquest.get(sample_id)
    services.samples.update(sample_id, {"vquest": bool((remaining or {}).get("results"))})
    services.audit.record(
        session.user.username,
        "vquest.submission.deleted",
        f"sample:{sample_id}",
        {"submission_id": submission_id},
    )
    return None
