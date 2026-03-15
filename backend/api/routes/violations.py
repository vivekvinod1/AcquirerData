from fastapi import APIRouter, HTTPException
from core.job_store import job_store
from core.models import ViolationReport

router = APIRouter()


@router.get("/violations/rules")
async def get_violation_rules():
    """Return metadata for all 13 violation rules (for the UI rule selector)."""
    from rules.violation_rules import VIOLATION_RULES
    return [
        {
            "id": r["id"],
            "name": r["name"],
            "description": r["description"],
            "columns": r["columns"],
        }
        for r in VIOLATION_RULES
    ]


@router.get("/violations/{job_id}", response_model=ViolationReport | None)
async def get_violations(job_id: str):
    job = job_store.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job.violation_report
