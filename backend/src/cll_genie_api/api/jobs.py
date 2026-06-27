from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from cll_genie_api.api.common import serialize
from cll_genie_api.api.dependencies import Services, get_current_session, get_services
from cll_genie_api.domain.identity import Session

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("/{job_id}")
def get_job(
    job_id: str,
    session: Annotated[Session, Depends(get_current_session)],
    services: Annotated[Services, Depends(get_services)],
):
    del session
    try:
        job = services.jobs.get(job_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Job not found") from exc
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return serialize(job)
