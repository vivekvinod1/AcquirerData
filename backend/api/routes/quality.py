from fastapi import APIRouter, HTTPException
from core.job_store import job_store
from core.models import QualityReport

router = APIRouter()


@router.get("/quality/{job_id}", response_model=QualityReport | None)
async def get_quality_report(job_id: str):
    job = job_store.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job.quality_report


@router.get("/quality/ingestion/{job_id}", response_model=QualityReport | None)
async def get_ingestion_quality(job_id: str):
    """Return the DQ report from the ingestion phase (pre-schema-mapping)."""
    job = job_store.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job.ingestion_dq_report
