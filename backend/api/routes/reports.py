import io
import pandas as pd
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from core.job_store import job_store

router = APIRouter()


@router.get("/reports/{job_id}/download")
async def download_reports(job_id: str):
    job = job_store.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")

    buffer = io.BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        # Schema mapping sheet
        if job.schema_mapping:
            mapping_data = [m.model_dump() for m in job.schema_mapping.mappings]
            pd.DataFrame(mapping_data).to_excel(writer, sheet_name="Schema Mapping", index=False)

        # Quality report sheet
        if job.quality_report:
            for tq in job.quality_report.tables:
                col_data = [c.model_dump() for c in tq.columns]
                df = pd.DataFrame(col_data)
                sheet_name = f"DQ_{tq.table_name[:25]}"
                df.to_excel(writer, sheet_name=sheet_name, index=False)

        # Violations sheet
        if job.violation_report:
            viol_data = []
            for v in job.violation_report.violations:
                for row in v.sample_rows:
                    viol_data.append({"rule_id": v.rule_id, "rule_name": v.rule_name, **row})
            if viol_data:
                pd.DataFrame(viol_data).to_excel(writer, sheet_name="Violations", index=False)

        # AMMF output sheet
        if job.ammf_dataframe is not None:
            job.ammf_dataframe.to_excel(writer, sheet_name="AMMF Data", index=False)

    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=AMMF_Report_{job_id}.xlsx"},
    )
