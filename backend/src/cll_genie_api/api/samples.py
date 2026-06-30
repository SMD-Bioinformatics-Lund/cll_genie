from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status

from cll_genie_api.api.common import serialize
from cll_genie_api.api.dependencies import (
    Services,
    assert_role,
    get_current_session,
    get_services,
    record_audit,
    require_csrf,
)
from cll_genie_api.api.schemas import PreviewSequencesRequest
from cll_genie_api.domain.identity import Session
from cll_genie_api.parsers.lymphotrack import LymphotrackParseError, parse_qc

router = APIRouter(prefix="/samples", tags=["samples"])


def _artifact_audit_metadata(artifact: dict) -> dict:
    return {
        "artifact_id": str(artifact["_id"]),
        "filename": artifact.get("filename"),
        "media_type": artifact.get("media_type"),
        "size_bytes": artifact.get("size"),
        "sha256": artifact.get("sha256"),
        "storage": "local",
    }


def _attempted_upload_metadata(file: UploadFile) -> dict:
    return {
        "original_filename": file.filename,
        "media_type": file.content_type,
        "declared_size_bytes": file.size,
        "storage": "local",
    }


@router.get("")
def list_samples(
    session: Annotated[Session, Depends(get_current_session)],
    services: Annotated[Services, Depends(get_services)],
    search: str = Query(default="", max_length=100),
    report_status: bool | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
):
    del session
    samples, total = services.samples.list(
        search=search,
        report_status=report_status,
        skip=(page - 1) * page_size,
        limit=min(page_size, services.settings.page_size_max),
    )
    return {"items": serialize(samples), "total": total, "page": page, "page_size": page_size}


@router.get("/{sample_id}")
def get_sample(
    sample_id: str,
    session: Annotated[Session, Depends(get_current_session)],
    services: Annotated[Services, Depends(get_services)],
):
    try:
        sample = services.samples.get(sample_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Sample not found") from exc
    if sample is None:
        raise HTTPException(status_code=404, detail="Sample not found")
    result_document = services.vquest.get(sample_id)
    submissions = (result_document or {}).get("results", {})
    reports = services.reports.list_for_sample(sample_id)
    return {
        "sample": serialize(sample),
        "submissions": serialize(submissions),
        "reports": serialize(reports),
    }


@router.post("/{sample_id}/artifacts/lymphotrack-excel", status_code=status.HTTP_201_CREATED)
def upload_excel(
    sample_id: str,
    file: Annotated[UploadFile, File()],
    session: Annotated[Session, Depends(require_csrf)],
    services: Annotated[Services, Depends(get_services)],
):
    assert_role(session, ["lymphotrack", "lymphotrack_admin", "admin"])
    sample = services.samples.get(sample_id)
    if sample is None:
        record_audit(
            services,
            "sample.lymphotrack_excel.upload_failed",
            "LymphoTrack workbook upload failed because the sample was not found",
            severity="warning",
            category="data",
            outcome="failure",
            actor=session.user,
            provider=session.provider,
            resource_type="sample",
            resource_id=sample_id,
            tags=["sample", "upload", "lymphotrack", "workbook", "failure"],
            metadata={"reason": "sample_not_found", **_attempted_upload_metadata(file)},
        )
        raise HTTPException(status_code=404, detail="Sample not found")
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in {".xlsx", ".xlsm"}:
        record_audit(
            services,
            "sample.lymphotrack_excel.upload_failed",
            "LymphoTrack workbook upload was rejected due to an unsupported file type",
            severity="warning",
            category="data",
            outcome="failure",
            actor=session.user,
            provider=session.provider,
            resource_type="sample",
            resource_id=sample_id,
            resource_name=sample.get("name"),
            tags=["sample", "upload", "lymphotrack", "workbook", "validation", "failure"],
            metadata={
                "reason": "unsupported_file_type",
                "allowed_extensions": [".xlsx", ".xlsm"],
                **_attempted_upload_metadata(file),
            },
        )
        raise HTTPException(status_code=422, detail="Only .xlsx and .xlsm files are supported")
    artifact = services.artifacts.save_stream(
        f"samples/{sample_id}/lymphotrack",
        file.filename or "lymphotrack.xlsx",
        file.file,
        media_type=file.content_type
        or "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        actor=session.user.username,
        kind="lymphotrack-excel",
    )
    services.samples.update(
        sample_id,
        {
            "lymphotrack_excel": True,
            "lymphotrack_excel_artifact_id": artifact["_id"],
            "lymphotrack_excel_path": str(services.artifacts.resolve(artifact["relative_path"])),
        },
    )
    record_audit(
        services,
        "sample.lymphotrack_excel.uploaded",
        "LymphoTrack workbook was uploaded",
        category="data",
        actor=session.user,
        provider=session.provider,
        resource_type="sample",
        resource_id=sample_id,
        resource_name=sample.get("name"),
        tags=["sample", "upload", "lymphotrack", "artifact"],
        metadata={
            "ingestion_mode": "personal-upload",
            "sample_id": sample_id,
            "clarity_id": sample.get("clarity_id"),
            "run_id": sample.get("run_id"),
            **_artifact_audit_metadata(artifact),
        },
    )
    return serialize(artifact)


@router.post("/{sample_id}/artifacts/lymphotrack-qc", status_code=status.HTTP_201_CREATED)
def upload_qc(
    sample_id: str,
    file: Annotated[UploadFile, File()],
    session: Annotated[Session, Depends(require_csrf)],
    services: Annotated[Services, Depends(get_services)],
):
    assert_role(session, ["lymphotrack", "lymphotrack_admin", "admin"])
    sample = services.samples.get(sample_id)
    if sample is None:
        record_audit(
            services,
            "sample.lymphotrack_qc.upload_failed",
            "LymphoTrack QC upload failed because the sample was not found",
            severity="warning",
            category="data",
            outcome="failure",
            actor=session.user,
            provider=session.provider,
            resource_type="sample",
            resource_id=sample_id,
            tags=["sample", "upload", "lymphotrack", "quality-control", "failure"],
            metadata={"reason": "sample_not_found", **_attempted_upload_metadata(file)},
        )
        raise HTTPException(status_code=404, detail="Sample not found")
    artifact = services.artifacts.save_stream(
        f"samples/{sample_id}/lymphotrack",
        file.filename or "lymphotrack-qc.tsv",
        file.file,
        media_type=file.content_type or "text/tab-separated-values",
        actor=session.user.username,
        kind="lymphotrack-qc",
    )
    try:
        qc_values = parse_qc(services.artifacts.resolve(artifact["relative_path"]))
    except LymphotrackParseError as exc:
        record_audit(
            services,
            "sample.lymphotrack_qc.upload_failed",
            "LymphoTrack QC upload was stored but could not be parsed",
            severity="warning",
            category="data",
            outcome="failure",
            actor=session.user,
            provider=session.provider,
            resource_type="sample",
            resource_id=sample_id,
            resource_name=sample.get("name"),
            tags=[
                "sample",
                "upload",
                "lymphotrack",
                "quality-control",
                "validation",
                "failure",
            ],
            metadata={
                "reason": "invalid_qc_content",
                "error": str(exc),
                **_artifact_audit_metadata(artifact),
            },
        )
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    services.samples.update(
        sample_id,
        {
            "lymphotrack_qc": True,
            "lymphotrack_qc_artifact_id": artifact["_id"],
            "lymphotrack_qc_path": str(services.artifacts.resolve(artifact["relative_path"])),
            **qc_values,
        },
    )
    record_audit(
        services,
        "sample.lymphotrack_qc.uploaded",
        "LymphoTrack QC metrics were uploaded and parsed",
        category="data",
        actor=session.user,
        provider=session.provider,
        resource_type="sample",
        resource_id=sample_id,
        resource_name=sample.get("name"),
        tags=["sample", "upload", "lymphotrack", "quality-control"],
        metadata={
            "ingestion_mode": "personal-upload",
            "sample_id": sample_id,
            "clarity_id": sample.get("clarity_id"),
            "run_id": sample.get("run_id"),
            "qc_metrics": qc_values,
            **_artifact_audit_metadata(artifact),
        },
    )
    return {"artifact": serialize(artifact), "qc": qc_values}


@router.post("/{sample_id}/preview-sequences", status_code=status.HTTP_200_OK)
def preview_sequences(
    sample_id: str,
    filters: PreviewSequencesRequest,
    session: Annotated[Session, Depends(require_csrf)],
    services: Annotated[Services, Depends(get_services)],
):
    assert_role(session, ["lymphotrack", "lymphotrack_admin", "admin"])
    sample = services.samples.get(sample_id)
    if sample is None:
        raise HTTPException(status_code=404, detail="Sample not found")
    artifact_id = filters.artifact_id or sample.get("lymphotrack_excel_artifact_id")
    if not artifact_id and not sample.get("lymphotrack_excel_path"):
        raise HTTPException(status_code=409, detail="No LymphoTrack workbook is available")

    if artifact_id:
        stored = services.artifacts.get(artifact_id)
        if stored is None:
            raise HTTPException(status_code=404, detail="Workbook artifact no longer exists")
        path = stored[1]
    else:
        path = Path(sample.get("lymphotrack_excel_path", ""))

    from cll_genie_api.parsers.lymphotrack import parse_workbook

    try:
        sequences, _ = parse_workbook(
            path,
            sheet_name=filters.sheet_name,
            header_row=filters.header_row,
            minimum_reads_percent=filters.minimum_reads_percent,
            in_frame=filters.in_frame,
            no_stop_codon=filters.no_stop_codon,
        )
    except LymphotrackParseError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"sequences": sequences}
