from typing import Annotated

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import FileResponse, HTMLResponse

from cll_genie_api.api.common import serialize
from cll_genie_api.api.dependencies import (
    Services,
    assert_role,
    get_current_session,
    get_services,
    record_audit,
    require_csrf,
)
from cll_genie_api.api.schemas import ReportGenerateRequest
from cll_genie_api.domain.identity import Session
from cll_genie_api.infrastructure.repositories import utcnow
from cll_genie_api.reporting.clinical import report_facts, suggested_summary
from cll_genie_api.reporting.render import ReportRenderer
from cll_genie_api.reporting.rules import RuleValidationError, render_rules

router = APIRouter(tags=["reports"])


def suggestion(services: Services, submission: dict) -> tuple[str, dict, list[dict]]:
    facts = report_facts(
        submission,
        services.settings.mutation_borderline_lower,
        services.settings.mutation_borderline_upper,
    )
    rules = services.rules.active()
    if not rules:
        return suggested_summary(facts), facts, []
    try:
        text, trace = render_rules(rules, facts)
    except RuleValidationError as exc:
        raise HTTPException(
            status_code=500, detail=f"Active report rules are invalid: {exc}"
        ) from exc
    return text, facts, trace


@router.get("/samples/{sample_id}/submissions/{submission_id}/report-suggestion")
def get_suggestion(
    sample_id: str,
    submission_id: str,
    session: Annotated[Session, Depends(get_current_session)],
    services: Annotated[Services, Depends(get_services)],
):
    del session
    submission = services.vquest.get_submission(sample_id, submission_id)
    if submission is None:
        raise HTTPException(status_code=404, detail="Submission not found")
    text, facts, trace = suggestion(services, submission)
    return {"text": text, "facts": serialize(facts), "rule_trace": serialize(trace)}


@router.post(
    "/samples/{sample_id}/submissions/{submission_id}/reports",
    status_code=status.HTTP_201_CREATED,
)
def generate_report(
    sample_id: str,
    submission_id: str,
    payload: ReportGenerateRequest,
    session: Annotated[Session, Depends(require_csrf)],
    services: Annotated[Services, Depends(get_services)],
):
    assert_role(session, ["lymphotrack", "lymphotrack_admin", "admin"])
    sample = services.samples.get(sample_id)
    submission = services.vquest.get_submission(sample_id, submission_id)
    if sample is None or submission is None:
        raise HTTPException(status_code=404, detail="Sample or submission not found")
    _suggested, facts, trace = suggestion(services, submission)
    report_oid = ObjectId()

    # Calculate report number
    report_count = services.reports.collection.count_documents(
        {"sample_id": ObjectId(sample_id), "submission_id": submission_id}
    )
    report_num = report_count + 1
    sub_num = submission_id.replace("submission_", "")
    display_report_id = f"{sample['name']}_{sub_num}_{report_num}"

    html = ReportRenderer().render_positive(
        sample=sample,
        submission_id=submission_id,
        submission=submission,
        summary=payload.summary,
        author=session.user.fullname,
        report_id=display_report_id,
        app_version=services.settings.app_version,
        analysis_run_at=services.settings.pdf_analysis_run_at,
    )
    artifact = services.artifacts.save_bytes(
        "saved_cll_reports",
        f"{display_report_id}.html",
        html.encode("utf-8"),
        media_type="text/html; charset=utf-8",
        actor=session.user.username,
        kind="positive-report-html",
        flat=True,
    )
    report_id = services.reports.create(
        {
            "_id": report_oid,
            "display_id": display_report_id,
            "sample_id": ObjectId(sample_id),
            "sample_name": sample["name"],
            "submission_id": submission_id,
            "report_type": "POSITIVE",
            "summary": payload.summary,
            "created_by": session.user.fullname,
            "artifact_id": artifact["_id"],
            "artifact_path": artifact["relative_path"],
            "fact_snapshot": facts,
            "rule_trace": trace,
        }
    )
    comment = {
        "id": ObjectId(),
        "text": payload.summary,
        "time_created": utcnow(),
        "author": session.user.fullname,
        "hidden": False,
        "hidden_by": "",
        "time_hidden": "",
    }
    services.vquest.add_comment(sample_id, submission_id, comment)
    services.samples.update(sample_id, {"report": True})
    record_audit(
        services,
        "report.created",
        "A positive clinical report was generated",
        category="reporting",
        actor=session.user,
        provider=session.provider,
        resource_type="report",
        resource_id=report_id,
        resource_name=sample.get("name"),
        tags=["report", "positive", "clinical-output"],
        metadata={
            "sample_id": sample_id,
            "submission_id": submission_id,
            "artifact_id": str(artifact["_id"]),
            "rule_matches": len(trace),
        },
    )
    return {"report_id": report_id, "display_report_id": display_report_id, "artifact": serialize(artifact)}


@router.post(
    "/samples/{sample_id}/submissions/{submission_id}/report-preview",
    response_class=HTMLResponse,
)
def preview_report(
    sample_id: str,
    submission_id: str,
    payload: ReportGenerateRequest,
    session: Annotated[Session, Depends(require_csrf)],
    services: Annotated[Services, Depends(get_services)],
):
    assert_role(session, ["lymphotrack", "lymphotrack_admin", "admin"])
    sample = services.samples.get(sample_id)
    submission = services.vquest.get_submission(sample_id, submission_id)
    if sample is None or submission is None:
        raise HTTPException(status_code=404, detail="Sample or submission not found")

    report_count = services.reports.collection.count_documents(
        {"sample_id": ObjectId(sample_id), "submission_id": submission_id}
    )
    report_num = report_count + 1
    sub_num = submission_id.replace("submission_", "")
    display_report_id = f"{sample['name']}_{sub_num}_{report_num}"

    return ReportRenderer().render_positive(
        sample=sample,
        submission_id=submission_id,
        submission=submission,
        summary=payload.summary,
        author=session.user.fullname,
        app_version=services.settings.app_version,
        analysis_run_at=services.settings.pdf_analysis_run_at,
        report_id=display_report_id,
        preview=True,
        csrf_token=session.csrf_token,
        base_url=services.settings.application_prefix,
    )


@router.post(
    "/samples/{sample_id}/submissions/{submission_id}/report-pdf",
    response_class=Response,
)
def download_report_pdf(
    sample_id: str,
    submission_id: str,
    payload: ReportGenerateRequest,
    session: Annotated[Session, Depends(require_csrf)],
    services: Annotated[Services, Depends(get_services)],
):
    assert_role(session, ["lymphotrack", "lymphotrack_admin", "admin"])
    sample = services.samples.get(sample_id)
    submission = services.vquest.get_submission(sample_id, submission_id)
    if sample is None or submission is None:
        raise HTTPException(status_code=404, detail="Sample or submission not found")

    html_content = ReportRenderer().render_positive(
        sample=sample,
        submission_id=submission_id,
        submission=submission,
        summary=payload.summary,
        author=session.user.fullname,
        app_version=services.settings.app_version,
        analysis_run_at=services.settings.pdf_analysis_run_at,
        preview=False,
    )

    from weasyprint import HTML

    pdf_bytes = HTML(string=html_content).write_pdf()

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": (
                f'attachment; filename="CLL_Genie_Report_{sample_id}_{submission_id}.pdf"'
            )
        },
    )


@router.post("/samples/{sample_id}/negative-report", status_code=status.HTTP_201_CREATED)
def generate_negative_report(
    sample_id: str,
    payload: ReportGenerateRequest,
    session: Annotated[Session, Depends(require_csrf)],
    services: Annotated[Services, Depends(get_services)],
):
    assert_role(session, ["lymphotrack", "lymphotrack_admin", "admin"])
    sample = services.samples.get(sample_id)
    if sample is None:
        raise HTTPException(status_code=404, detail="Sample not found")
    report_oid = ObjectId()
    display_report_id = f"{sample['name']}_NR"
    html = ReportRenderer().render_negative(
        sample=sample,
        summary=payload.summary,
        author=session.user.fullname,
        report_id=display_report_id,
        app_version=services.settings.app_version,
        analysis_run_at=services.settings.pdf_analysis_run_at,
    )
    artifact = services.artifacts.save_bytes(
        "saved_cll_reports",
        f"{sample['name']}_NR.html",
        html.encode("utf-8"),
        media_type="text/html; charset=utf-8",
        actor=session.user.username,
        kind="negative-report-html",
        flat=True,
    )
    report_id = services.reports.create(
        {
            "_id": report_oid,
            "display_id": display_report_id,
            "sample_id": ObjectId(sample_id),
            "sample_name": sample["name"],
            "submission_id": None,
            "report_type": "NEGATIVE",
            "summary": payload.summary,
            "created_by": session.user.fullname,
            "artifact_id": artifact["_id"],
            "artifact_path": artifact["relative_path"],
        }
    )
    services.samples.update(sample_id, {"report": True, "is_eligible_for_vquest": False})
    record_audit(
        services,
        "report.created",
        "A negative clinical report was generated",
        category="reporting",
        actor=session.user,
        provider=session.provider,
        resource_type="report",
        resource_id=display_report_id,
        resource_name=sample.get("name"),
        tags=["report", "negative", "clinical-output"],
        metadata={"sample_id": sample_id, "artifact_id": str(artifact["_id"])},
    )
    return {"report_id": report_id, "display_report_id": display_report_id, "artifact": serialize(artifact)}


@router.get("/samples/{sample_id}/reports")
def list_reports(
    sample_id: str,
    session: Annotated[Session, Depends(get_current_session)],
    services: Annotated[Services, Depends(get_services)],
):
    reports = services.reports.list_for_sample(sample_id)
    return serialize(reports)


@router.get("/reports")
def all_reports(
    session: Annotated[Session, Depends(get_current_session)],
    services: Annotated[Services, Depends(get_services)],
):
    reports = services.reports.list_all()
    return serialize(reports)


@router.get("/reports/{report_id}/artifact")
def report_artifact(
    report_id: str,
    session: Annotated[Session, Depends(get_current_session)],
    services: Annotated[Services, Depends(get_services)],
):
    report = services.reports.get(report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    if report.get("hidden") and not any(
        role in session.user.roles for role in ["admin", "lymphotrack_admin"]
    ):
        raise HTTPException(status_code=403, detail="Report is hidden")
    stored = services.artifacts.get(report["artifact_id"])
    if stored is None or not stored[1].is_file():
        raise HTTPException(status_code=404, detail="Report artifact is unavailable")
    record_audit(
        services,
        "report.accessed",
        "A generated report artifact was downloaded",
        category="activity",
        actor=session.user,
        provider=session.provider,
        resource_type="report",
        resource_id=report_id,
        resource_name=report.get("sample_name"),
        tags=["report", "download", "clinical-output"],
        metadata={"sample_id": str(report.get("sample_id"))},
    )
    return FileResponse(
        stored[1],
        media_type="text/html; charset=utf-8",
        filename=stored[0]["filename"],
    )


@router.patch("/reports/{report_id}")
def update_report_status(
    report_id: str,
    payload: dict,
    session: Annotated[Session, Depends(require_csrf)],
    services: Annotated[Services, Depends(get_services)],
):
    assert_role(session, ["admin", "lymphotrack_admin"])
    hidden = bool(payload.get("hidden"))
    report = services.reports.get(report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    services.reports.set_hidden(report_id, hidden, session.user.fullname)
    visible = [
        item
        for item in services.reports.list_for_sample(str(report["sample_id"]))
        if not item.get("hidden")
    ]
    services.samples.update(str(report["sample_id"]), {"report": bool(visible)})
    action = "hidden" if hidden else "restored"
    record_audit(
        services,
        f"report.{action}",
        f"A clinical report was {action}",
        severity="warning" if hidden else "info",
        category="reporting",
        actor=session.user,
        provider=session.provider,
        resource_type="report",
        resource_id=report_id,
        resource_name=report.get("sample_name"),
        tags=["report", action, "clinical-output"],
        metadata={"sample_id": str(report["sample_id"])},
    )
    return {"updated": True}
