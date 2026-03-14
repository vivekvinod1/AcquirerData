from fastapi import APIRouter, HTTPException, BackgroundTasks
from core.job_store import job_store
from core.models import PipelineStatus, PipelineRunRequest, PipelineStep
import pandas as pd
import re

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

    job.selected_steps = request.selected_steps

    from agents.orchestrator import run_pipeline_async
    background_tasks.add_task(run_pipeline_async, job)

    return {"job_id": job.job_id, "status": "running"}


@router.get("/pipeline/status/{job_id}", response_model=PipelineStatus)
async def get_pipeline_status(job_id: str):
    job = job_store.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job.get_status()


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

    field_defs = {
        "processor_name": _PROCESSOR_NAME_PATTERNS,
        "processor_bin_cib": _PROCESSOR_CIB_PATTERNS,
        "acquirer_name": _ACQUIRER_NAME_PATTERNS,
        "acquirer_bid": _ACQUIRER_BID_PATTERNS,
        "acquirer_bin": _ACQUIRER_BIN_PATTERNS,
    }

    results: dict[str, dict] = {}
    source_table: str | None = None

    for field_key, pattern in field_defs.items():
        for table_name, df in search_order:
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
