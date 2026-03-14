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

        # Violations — full data per rule (not just sample rows)
        if job.violation_report:
            # Summary sheet with counts
            summary_data = []
            for v in job.violation_report.violations:
                summary_data.append({
                    "rule_id": v.rule_id,
                    "rule_name": v.rule_name,
                    "description": v.description,
                    "affected_rows": v.count,
                    "groups": v.group_count,
                    "affected_columns": ", ".join(v.affected_columns),
                })
            if summary_data:
                pd.DataFrame(summary_data).to_excel(
                    writer, sheet_name="Violation Summary", index=False
                )

            # Full violation rows per rule (from stored DataFrames)
            viol_dfs = getattr(job, "violation_dataframes", {})
            for v in job.violation_report.violations:
                if v.count <= 0:
                    continue
                rule_df = viol_dfs.get(v.rule_id)
                if rule_df is not None and len(rule_df) > 0:
                    # Drop internal normalized columns (start with _)
                    export_cols = [c for c in rule_df.columns if not c.startswith("_")]
                    sheet = f"V_{v.rule_id}"  # e.g. "V_V11"
                    rule_df[export_cols].to_excel(
                        writer, sheet_name=sheet[:31], index=False
                    )
                else:
                    # Fallback to sample rows if full DF not available
                    if v.sample_rows:
                        rows = [{"rule_id": v.rule_id, **row} for row in v.sample_rows]
                        pd.DataFrame(rows).to_excel(
                            writer, sheet_name=f"V_{v.rule_id}"[:31], index=False
                        )

        # AMMF output sheet
        if job.ammf_dataframe is not None:
            job.ammf_dataframe.to_excel(writer, sheet_name="AMMF Data", index=False)

    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=AMMF_Report_{job_id}.xlsx"},
    )
