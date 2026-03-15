"""LLM-powered chat endpoint for querying job data quality and mapping issues."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from core.job_store import job_store

router = APIRouter()


class ChatRequest(BaseModel):
    message: str


@router.post("/chat/{job_id}")
async def chat_with_data(job_id: str, request: ChatRequest):
    """Chat with Claude about the current job's data quality and schema mapping."""
    job = job_store.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")

    # Build rich context from job state
    context_parts = []

    # Table info
    if job.tables:
        context_parts.append(f"Uploaded data: {len(job.tables)} table(s)")
        for name, df in job.tables.items():
            context_parts.append(
                f"  Table '{name}': {len(df)} rows, {len(df.columns)} columns: {list(df.columns)}"
            )

    # Ingestion DQ report
    if job.ingestion_dq_report:
        context_parts.append("\nInput Data Quality:")
        for t in job.ingestion_dq_report.tables:
            context_parts.append(f"  Table '{t.table_name}': score {t.overall_score}/100")
            issue_cols = [c for c in t.columns if c.issues]
            for c in issue_cols:
                context_parts.append(f"    {c.column}: {', '.join(c.issues)} (null: {c.null_pct}%)")

    # Schema mapping
    if job.schema_mapping:
        mapped = [m for m in job.schema_mapping.mappings if m.source_column or m.is_derived]
        unmapped_req = job.schema_mapping.unmapped_required
        unmapped_opt = job.schema_mapping.unmapped_optional
        context_parts.append(
            f"\nSchema Mapping: {len(mapped)}/{len(job.schema_mapping.mappings)} columns mapped"
        )
        if unmapped_req:
            context_parts.append(f"  UNMAPPED REQUIRED columns: {unmapped_req}")
        if unmapped_opt:
            context_parts.append(f"  Unmapped optional columns: {unmapped_opt}")
        # Show low-confidence mappings
        low_conf = [m for m in job.schema_mapping.mappings if m.source_column and m.confidence < 0.7]
        if low_conf:
            context_parts.append("  Low-confidence mappings:")
            for m in low_conf:
                context_parts.append(
                    f"    {m.ammf_column} <- {m.source_table}.{m.source_column} "
                    f"(confidence: {m.confidence:.0%}) — {m.reasoning}"
                )

    # Violation report (if available)
    if job.violation_report:
        context_parts.append(f"\nViolation Report: {job.violation_report.total_violations} total violations")
        for v in job.violation_report.violations:
            if v.count > 0:
                context_parts.append(f"  {v.rule_id} ({v.rule_name}): {v.count} rows")

    system_prompt = (
        "You are a data quality assistant for AMMF (Acquirer Merchant Master File) data preparation. "
        "Help the user understand data quality issues, schema mapping gaps, and how to improve their data. "
        "The AMMF format has 31 required/optional columns for Visa's acquirer merchant compliance program.\n\n"
        "Be concise, specific, and actionable. When suggesting fixes, reference specific table names and columns.\n\n"
        "Current job context:\n" + "\n".join(context_parts)
    )

    # Build user prompt with conversation history for multi-turn
    user_prompt = request.message
    if job.chat_history:
        history_lines = []
        for m in job.chat_history[-10:]:  # Last 10 messages for context
            role = "User" if m["role"] == "user" else "Assistant"
            history_lines.append(f"{role}: {m['content']}")
        user_prompt = (
            "Previous conversation:\n" + "\n".join(history_lines) +
            f"\n\nUser: {request.message}"
        )

    from core.llm_client import llm_client
    from core.config_store import get_prompt
    # The chat system prompt has dynamic job context appended, so we only override the static prefix
    custom_prefix = get_prompt("chat", None)
    if custom_prefix:
        system_prompt = custom_prefix + "\n\nCurrent job context:\n" + "\n".join(context_parts)
    response_text = llm_client.text_query(system_prompt, user_prompt, label="Chat Response")

    # Store in chat history
    job.chat_history.append({"role": "user", "content": request.message})
    job.chat_history.append({"role": "assistant", "content": response_text})

    return {"response": response_text}
