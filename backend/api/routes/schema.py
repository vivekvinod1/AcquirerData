from fastapi import APIRouter, HTTPException
from core.job_store import job_store
from core.models import SchemaMapping, ColumnMapping

router = APIRouter()


@router.get("/schema/{job_id}", response_model=SchemaMapping | None)
async def get_schema_mapping(job_id: str):
    job = job_store.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job.schema_mapping


@router.put("/schema/{job_id}")
async def update_schema_mapping(job_id: str, mapping: SchemaMapping):
    job = job_store.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    job.schema_mapping = mapping
    job.add_message("Schema mapping updated by user")
    return {"status": "updated"}
