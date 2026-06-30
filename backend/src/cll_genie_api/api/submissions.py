from pathlib import Path
from typing import Annotated

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse

from cll_genie_api.api.common import serialize
from cll_genie_api.api.dependencies import (
    Services,
    assert_role,
    get_current_session,
    get_services,
    record_audit,
    require_csrf,
)
from cll_genie_api.api.schemas import CommentRequest, CommentStatusRequest, VquestSubmitRequest
from cll_genie_api.domain.identity import Session
from cll_genie_api.infrastructure.repositories import utcnow
from cll_genie_api.tasks import run_vquest

router = APIRouter(tags=["submissions"])


def visible_submission(submission: dict, session: Session) -> dict:
    return submission


@router.post("/samples/{sample_id}/submit-vquest", status_code=status.HTTP_202_ACCEPTED)
def submit_vquest(
    sample_id: str,
    payload: VquestSubmitRequest,
    session: Annotated[Session, Depends(require_csrf)],
    services: Annotated[Services, Depends(get_services)],
):
    assert_role(session, ["lymphotrack", "lymphotrack_admin", "admin"])
    if not payload.sequences:
        raise HTTPException(status_code=422, detail="No sequences provided")

    job_id = services.jobs.create(
        "VQUEST",
        sample_id,
        {"sequence_count": len(payload.sequences), "options": payload.options},
        session.user.username,
    )
    run_vquest.delay(job_id, sample_id, payload.sequences, payload.options, session.user.username)
    record_audit(
        services,
        "vquest.analysis.queued",
        "IMGT/V-QUEST analysis was queued",
        category="analysis",
        actor=session.user,
        provider=session.provider,
        resource_type="analysis_job",
        resource_id=job_id,
        tags=["analysis", "imgt", "vquest", "job"],
        metadata={
            "sample_id": sample_id,
            "sequence_count": len(payload.sequences),
            "option_names": sorted(payload.options),
        },
    )
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
    assert_role(session, ["lymphotrack", "lymphotrack_admin", "admin"])
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
    record_audit(
        services,
        "vquest.comment.created",
        "A submission comment was added",
        category="activity",
        actor=session.user,
        provider=session.provider,
        resource_type="submission",
        resource_id=submission_id,
        tags=["vquest", "comment", "sample"],
        metadata={"sample_id": sample_id, "comment_id": str(comment["id"])},
    )
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
    assert_role(session, ["admin", "lymphotrack_admin"])
    if not services.vquest.set_comment_hidden(
        sample_id, submission_id, comment_id, payload.hidden, session.user.fullname
    ):
        raise HTTPException(status_code=404, detail="Comment not found")
    action = "hidden" if payload.hidden else "restored"
    record_audit(
        services,
        f"vquest.comment.{action}",
        f"A submission comment was {action}",
        severity="warning" if payload.hidden else "info",
        category="activity",
        actor=session.user,
        provider=session.provider,
        resource_type="submission",
        resource_id=submission_id,
        tags=["vquest", "comment", action],
        metadata={"sample_id": sample_id, "comment_id": comment_id},
    )
    return {"updated": True}


@router.delete("/samples/{sample_id}/submissions/{submission_id}", status_code=204)
def delete_submission(
    sample_id: str,
    submission_id: str,
    session: Annotated[Session, Depends(require_csrf)],
    services: Annotated[Services, Depends(get_services)],
):
    assert_role(session, ["admin", "lymphotrack_admin"])
    
    submission = services.vquest.get_submission(sample_id, submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
        
    # Cascade delete reports and their artifacts
    reports = services.reports.list_for_sample(sample_id)
    for report in reports:
        if report.get("submission_id") == submission_id:
            services.artifacts.delete(report["artifact_id"])
    services.reports.delete_by_submission(sample_id, submission_id)
    
    # Delete the ZIP file artifact if present
    zip_path = submission.get("results_zip_file")
    if zip_path:
        from pathlib import Path
        try:
            Path(zip_path).unlink(missing_ok=True)
            # Find and delete the DB artifact record using the absolute path to derive the relative path
            # (Best effort cleanup for legacy paths)
            relative = Path(zip_path).relative_to(services.artifacts.root)
            art_doc = services.artifacts.collection.find_one({"relative_path": str(relative)})
            if art_doc:
                services.artifacts.delete(art_doc["_id"])
        except Exception:
            pass

    if not services.vquest.delete_submission(sample_id, submission_id):
        raise HTTPException(status_code=404, detail="Submission not found")
        
    remaining = services.vquest.get(sample_id)
    services.samples.update(sample_id, {"vquest": bool((remaining or {}).get("results"))})
    
    record_audit(
        services,
        "vquest.submission.deleted",
        "An IMGT/V-QUEST submission and all its associated reports were permanently deleted",
        severity="warning",
        category="data",
        actor=session.user,
        provider=session.provider,
        resource_type="submission",
        resource_id=submission_id,
        tags=["vquest", "submission", "deletion", "destructive-action"],
        metadata={"sample_id": sample_id},
    )
    return None
