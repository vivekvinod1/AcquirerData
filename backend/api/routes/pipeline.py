from fastapi import APIRouter, HTTPException, BackgroundTasks
from core.job_store import job_store
from core.models import PipelineStatus, PipelineRunRequest, PipelineStep

router = APIRouter()


@router.post("/pipeline/run")
async def run_pipeline(request: PipelineRunRequest, background_tasks: BackgroundTasks):
    job = job_store.get_job(request.job_id)
    if not job:
        raise HTTPException(404, "Job not found")

    if job.step not in (PipelineStep.UPLOADED, PipelineStep.COMPLETE, PipelineStep.ERROR):
        raise HTTPException(400, f"Pipeline already running (step: {job.step})")

    if request.cib_bin_config:
        job.cib_bin_config = request.cib_bin_config.model_dump()

    from agents.orchestrator import run_pipeline_async
    background_tasks.add_task(run_pipeline_async, job)

    return {"job_id": job.job_id, "status": "running"}


@router.get("/pipeline/status/{job_id}", response_model=PipelineStatus)
async def get_pipeline_status(job_id: str):
    job = job_store.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job.get_status()
