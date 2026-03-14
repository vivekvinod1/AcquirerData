"""API routes for violation auto-remediation and web research."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from core.job_store import job_store

router = APIRouter()


class RemediationPlanRequest(BaseModel):
    job_id: str
    rule_id: str


class ApplyFixesRequest(BaseModel):
    job_id: str
    rule_id: str
    fix_indices: list[int]


class WebResearchRequest(BaseModel):
    job_id: str
    merchant_name: str
    violation_context: str
    user_objective: str = ""
    affected_columns: list[str] = []


class ApplyWebFixRequest(BaseModel):
    job_id: str
    row_index: int
    fixes: list[dict]  # [{column, value}]


@router.get("/remediation/rows/{job_id}/{rule_id}")
async def get_violation_rows(job_id: str, rule_id: str, page: int = 1, page_size: int = 50):
    """Return paginated violation rows for a specific rule."""
    job = job_store.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")

    viol_dfs = getattr(job, "violation_dataframes", {})
    df = viol_dfs.get(rule_id)
    if df is None:
        raise HTTPException(404, f"No violation data for {rule_id}")

    total = len(df)
    start = (page - 1) * page_size
    end = start + page_size
    page_df = df.iloc[start:end].fillna("")

    return {
        "rule_id": rule_id,
        "total": total,
        "page": page,
        "page_size": page_size,
        "columns": list(df.columns),
        "rows": page_df.to_dict(orient="records"),
    }


@router.post("/remediation/plan")
async def generate_plan(request: RemediationPlanRequest):
    """Generate a remediation plan for a specific violation rule."""
    job = job_store.get_job(request.job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    if not job.violation_report:
        raise HTTPException(400, "No violation report available — run pipeline first")

    from agents.remediation_agent import generate_remediation_plan
    try:
        plan = generate_remediation_plan(job, request.rule_id)
        return plan.model_dump()
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/remediation/apply")
async def apply_fixes(request: ApplyFixesRequest):
    """Apply selected fixes from a remediation plan."""
    job = job_store.get_job(request.job_id)
    if not job:
        raise HTTPException(404, "Job not found")

    from agents.remediation_agent import apply_fixes as do_apply
    try:
        result = do_apply(job, request.rule_id, request.fix_indices)
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/remediation/plan/{job_id}/{rule_id}")
async def get_plan(job_id: str, rule_id: str):
    """Get an existing remediation plan for a rule."""
    job = job_store.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    plan = job.remediation_plans.get(rule_id)
    if not plan:
        raise HTTPException(404, f"No remediation plan for {rule_id}")
    return plan.model_dump()


@router.post("/remediation/research")
async def web_research(request: WebResearchRequest):
    """Run web research for a specific merchant."""
    job = job_store.get_job(request.job_id)
    if not job:
        raise HTTPException(404, "Job not found")

    from agents.web_research_agent import research_merchant
    result = await research_merchant(
        merchant_name=request.merchant_name,
        violation_context=request.violation_context,
        user_objective=request.user_objective,
        affected_columns=request.affected_columns,
    )
    return result.model_dump()


@router.post("/remediation/apply-web-fix")
async def apply_web_fix(request: ApplyWebFixRequest):
    """Apply fixes from web research directly to a specific row."""
    job = job_store.get_job(request.job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    if job.ammf_dataframe is None:
        raise HTTPException(400, "No AMMF data available")

    ammf = job.ammf_dataframe
    if request.row_index < 0 or request.row_index >= len(ammf):
        raise HTTPException(400, f"Invalid row index: {request.row_index}")

    modified = 0
    for fix in request.fixes:
        col = fix.get("column")
        val = fix.get("value")
        if col and col in ammf.columns and val is not None:
            ammf.at[request.row_index, col] = val
            modified += 1

    return {"row_index": request.row_index, "columns_modified": modified}
