import io
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from core.job_store import job_store
from core.models import AMMFPreview

router = APIRouter()


@router.get("/ammf/{job_id}/preview", response_model=AMMFPreview)
async def preview_ammf(job_id: str, page: int = 1, page_size: int = 50):
    job = job_store.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    if job.ammf_dataframe is None:
        raise HTTPException(400, "AMMF output not yet generated")

    df = job.ammf_dataframe
    total = len(df)
    start = (page - 1) * page_size
    end = start + page_size
    rows = df.iloc[start:end].fillna("").to_dict(orient="records")

    return AMMFPreview(rows=rows, total=total, page=page, page_size=page_size)


@router.get("/ammf/{job_id}/download")
async def download_ammf(job_id: str):
    job = job_store.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    if job.ammf_dataframe is None:
        raise HTTPException(400, "AMMF output not yet generated")

    buffer = io.BytesIO()
    job.ammf_dataframe.to_excel(buffer, index=False, sheet_name="AMMF Data")
    buffer.seek(0)

    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=AMMF_{job_id}.xlsx"},
    )
