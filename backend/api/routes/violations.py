from fastapi import APIRouter, HTTPException
from core.job_store import job_store
from core.models import ViolationReport

router = APIRouter()


@router.get("/violations/{job_id}", response_model=ViolationReport | None)
async def get_violations(job_id: str):
    job = job_store.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job.violation_report
