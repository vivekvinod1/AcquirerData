from fastapi import APIRouter, HTTPException, BackgroundTasks
from core.job_store import job_store
from core.models import PipelineStatus, PipelineRunRequest, PipelineContinueRequest, SQLApprovalRequest, PipelineStep, JobSummary
import pandas as pd
import re

router = APIRouter()


@router.get("/jobs", response_model=list[JobSummary])
async def list_jobs():
    """Return summaries of all pipeline runs (live + persisted), most recent first."""
    summaries = [job_store.get_summary(jid) for jid in job_store.list_jobs()]
    summaries = [s for s in summaries if s is not None]
    summaries.sort(key=lambda s: s.created_at or "", reverse=True)
    return summaries


@router.post("/pipeline/run")
async def run_pipeline(request: PipelineRunRequest, background_tasks: BackgroundTasks):
    job = job_store.get_job(request.job_id)
    if not job:
        raise HTTPException(404, "Job not found")

    if job.step not in (PipelineStep.UPLOADED, PipelineStep.COMPLETE, PipelineStep.ERROR):
        raise HTTPException(400, f"Pipeline already running (step: {job.step})")

    if request.cib_bin_config:
        job.cib_bin_config = request.cib_bin_config.model_dump()

    job.selected_steps = request.selected_steps
    if request.selected_violations is not None:
        job.selected_violations = request.selected_violations
    job.force_review = request.force_review

    from agents.orchestrator import run_pipeline_async
    background_tasks.add_task(run_pipeline_async, job)

    return {"job_id": job.job_id, "status": "running"}


@router.post("/pipeline/continue")
async def continue_pipeline(request: PipelineContinueRequest, background_tasks: BackgroundTasks):
    """Resume pipeline after human approval of ingestion results (DQ + schema mapping)."""
    job = job_store.get_job(request.job_id)
    if not job:
        raise HTTPException(404, "Job not found")

    if job.step != PipelineStep.AWAITING_APPROVAL:
        raise HTTPException(400, f"Job not in awaiting_approval state (current: {job.step})")

    job.schema_approved = True
    if request.selected_violations is not None:
        job.selected_violations = request.selected_violations
    if request.user_instructions:
        job.user_instructions = request.user_instructions

    if request.save_as_template:
        from core.config_store import compute_schema_fingerprint, save_mapping_template
        if job.tables and job.schema_mapping:
            fp = compute_schema_fingerprint(job.tables)
            job.schema_fingerprint = fp
            template_data = {
                "fingerprint": fp,
                "name": request.template_name or f"Template {fp[:8]}",
                "created_at": __import__("datetime").datetime.now().isoformat(),
                "table_summary": {
                    name: sorted(str(c) for c in df.columns)
                    for name, df in job.tables.items()
                },
                "schema_mapping": job.schema_mapping.model_dump(),
                "user_instructions": job.user_instructions,
                "selected_violations": list(job.selected_violations) if job.selected_violations else None,
            }
            save_mapping_template(fp, template_data)
            job.add_message(f"Saved mapping as template: '{template_data['name']}'")

    from agents.orchestrator import run_pipeline_phase2
    background_tasks.add_task(run_pipeline_phase2, job)

    return {"job_id": job.job_id, "status": "continuing"}


@router.post("/pipeline/approve-sql")
async def approve_sql(request: SQLApprovalRequest, background_tasks: BackgroundTasks):
    """Resume pipeline after human approval (and optional edit) of the generated SQL."""
    job = job_store.get_job(request.job_id)
    if not job:
        raise HTTPException(404, "Job not found")

    if job.step != PipelineStep.AWAITING_SQL_APPROVAL:
        raise HTTPException(400, f"Job not in awaiting_sql_approval state (current: {job.step})")

    # If user edited the SQL, use their version
    if request.approved_sql and request.approved_sql.strip():
        job.generated_sql = request.approved_sql.strip()
        job.add_message("SQL was edited by reviewer before approval")

    job.sql_approved = True
    job.add_message("SQL approved — proceeding to execution")

    # Save as template if requested
    if request.save_as_template:
        from core.config_store import compute_schema_fingerprint, save_mapping_template
        if job.tables and job.schema_mapping:
            fp = compute_schema_fingerprint(job.tables)
            job.schema_fingerprint = fp
            template_data = {
                "fingerprint": fp,
                "name": request.template_name or f"Template {fp[:8]}",
                "created_at": __import__("datetime").datetime.now().isoformat(),
                "table_summary": {
                    name: sorted(str(c) for c in df.columns)
                    for name, df in job.tables.items()
                },
                "schema_mapping": job.schema_mapping.model_dump(),
                "user_instructions": getattr(job, "user_instructions", None),
                "selected_violations": list(job.selected_violations) if job.selected_violations else None,
                "generated_sql": job.generated_sql,
            }
            save_mapping_template(fp, template_data)
            job.add_message(f"Saved mapping + SQL as template: '{template_data['name']}'")

    from agents.orchestrator import run_pipeline_phase3
    background_tasks.add_task(run_pipeline_phase3, job)

    return {"job_id": job.job_id, "status": "executing"}


@router.get("/pipeline/status/{job_id}", response_model=PipelineStatus)
async def get_pipeline_status(job_id: str):
    job = job_store.get_job(job_id)
    if job:
        return job.get_status()
    # Fall back to persisted summary (past run, server restarted)
    summary = job_store.get_summary(job_id)
    if summary:
        return PipelineStatus(
            job_id=summary.job_id,
            step=summary.step,
            progress_pct=summary.progress_pct,
            messages=["This run's detailed data is no longer available (server was restarted)."],
            started_at=summary.started_at,
            completed_at=summary.completed_at,
        )
    raise HTTPException(404, "Job not found")


@router.get("/pipeline/sql/{job_id}")
async def get_generated_sql(job_id: str):
    job = job_store.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return {"sql": job.generated_sql}


@router.get("/pipeline/llm-logs/{job_id}")
async def get_llm_logs(job_id: str):
    """Return LLM call logs for this job's latest pipeline run only."""
    job = job_store.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    from core.llm_client import summarize_logs
    return summarize_logs(job.llm_call_logs)


# ---------------------------------------------------------------------------
# Reference-value extraction: scan uploaded tables for CIB/BIN/BID options
# ---------------------------------------------------------------------------

_PROCESSOR_NAME_PATTERNS = re.compile(
    r"processor.?name|proc.?name|cib.?name", re.IGNORECASE
)
_PROCESSOR_CIB_PATTERNS = re.compile(
    r"processor.?bin.?cib|processor.?cib|cib$|cib.?id|proc.?cib", re.IGNORECASE
)
_ACQUIRER_NAME_PATTERNS = re.compile(
    r"acquirer.?name|acq.?name|bid.?name", re.IGNORECASE
)
_ACQUIRER_BID_PATTERNS = re.compile(
    r"acquirer.?bid|bid$|bid.?id|acq.?bid|business.?id", re.IGNORECASE
)
_ACQUIRER_BIN_PATTERNS = re.compile(
    r"acquirer.?bin|bin$|bin.?id|acq.?bin|acquiring.?bin", re.IGNORECASE
)

# Tables whose names suggest they carry reference/master data for BIN/CIB/BID
_REF_TABLE_PATTERNS = re.compile(
    r"bin|cib|bid|master|processor|acquirer|reference|ref", re.IGNORECASE
)


def _distinct_non_empty(series: pd.Series, limit: int = 50) -> list:
    """Return up to *limit* distinct, non-null, non-empty values."""
    vals = (
        series.dropna()
        .astype(str)
        .str.strip()
        .loc[lambda s: (s != "") & (s.str.lower() != "nan")]
        .unique()
    )
    # Sort: numeric-like values numerically, others alphabetically
    def _sort_key(v: str):
        try:
            return (0, float(v), v)
        except ValueError:
            return (1, 0, v)

    return sorted(vals[:limit], key=_sort_key)


def _find_column(df: pd.DataFrame, pattern: re.Pattern) -> str | None:
    """Return the first column name that matches *pattern*, or None."""
    for col in df.columns:
        if pattern.search(str(col)):
            return col
    return None


@router.get("/pipeline/reference-values/{job_id}")
async def get_reference_values(job_id: str):
    """Scan uploaded tables and return candidate dropdown values for CIB/BIN config.

    Strategy:
      1. Prioritise tables whose name contains "bin", "cib", "bid", "master", etc.
      2. Fall back to *all* tables if no reference table is found.
      3. For each of the 5 fields, find the best-matching column and return its
         distinct values so the frontend can present dropdowns.
    """
    job = job_store.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")

    if not job.tables:
        return {"source_table": None, "fields": {}}

    # Partition tables: reference-like first, then everything else
    ref_tables: dict[str, pd.DataFrame] = {}
    other_tables: dict[str, pd.DataFrame] = {}
    for name, df in job.tables.items():
        if _REF_TABLE_PATTERNS.search(name):
            ref_tables[name] = df
        else:
            other_tables[name] = df

    search_order = list(ref_tables.items()) + list(other_tables.items())

    # Field definitions with preferred table source:
    #   "ref"  = prefer master/reference tables (for names — typically unique there)
    #   "txn"  = prefer transaction/non-reference tables (for numeric IDs)
    field_defs: list[tuple[str, re.Pattern, str]] = [
        ("processor_name",    _PROCESSOR_NAME_PATTERNS, "ref"),
        ("processor_bin_cib", _PROCESSOR_CIB_PATTERNS,  "txn"),
        ("acquirer_name",     _ACQUIRER_NAME_PATTERNS,   "ref"),
        ("acquirer_bid",      _ACQUIRER_BID_PATTERNS,    "txn"),
        ("acquirer_bin",      _ACQUIRER_BIN_PATTERNS,    "txn"),
    ]

    results: dict[str, dict] = {}
    source_table: str | None = None

    for field_key, pattern, prefer in field_defs:
        # Build search order: preferred table group first, then fallback
        if prefer == "txn":
            ordered = list(other_tables.items()) + list(ref_tables.items())
        else:
            ordered = list(ref_tables.items()) + list(other_tables.items())

        for table_name, df in ordered:
            col = _find_column(df, pattern)
            if col:
                vals = _distinct_non_empty(df[col])
                if vals:
                    results[field_key] = {
                        "source_table": table_name,
                        "source_column": col,
                        "values": vals,
                    }
                    if source_table is None:
                        source_table = table_name
                    break

    return {"source_table": source_table, "fields": results}


@router.get("/pipeline/template-check/{job_id}")
async def check_template_match(job_id: str):
    """Check if a saved mapping template matches the uploaded data's schema."""
    job = job_store.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    if not job.tables:
        return {"match": False, "fingerprint": None, "template_name": None}

    from core.config_store import compute_schema_fingerprint, get_mapping_template
    fp = compute_schema_fingerprint(job.tables)
    template = get_mapping_template(fp)

    if template:
        return {
            "match": True,
            "fingerprint": fp,
            "template_name": template.get("name", "Unnamed"),
            "created_at": template.get("created_at"),
        }
    return {"match": False, "fingerprint": fp, "template_name": None}
