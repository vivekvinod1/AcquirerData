"""Configuration API — DQ rules (read-only) and Violation rules (CRUD)."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


# ---------------------------------------------------------------------------
# DQ Rules (read-only)
# ---------------------------------------------------------------------------

@router.get("/config/dq-rules")
async def get_dq_rules():
    """Return metadata for all data quality rules (read-only)."""
    from core.config_store import DQ_RULES_METADATA
    return DQ_RULES_METADATA


# ---------------------------------------------------------------------------
# Violation Rules (CRUD)
# ---------------------------------------------------------------------------

class ViolationRuleUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    columns: list[str] | None = None
    sql: str | None = None
    enabled: bool | None = None


class ViolationRuleCreate(BaseModel):
    id: str
    name: str
    description: str
    columns: list[str]
    sql: str


@router.get("/config/violation-rules")
async def get_all_violation_rules():
    """Return all violation rules (built-in + custom) with SQL and edit status."""
    from rules.violation_rules import VIOLATION_RULES, VIOLATION_SQL
    from core.config_store import get_custom_rules

    custom = get_custom_rules()
    result = []

    # Built-in rules (may have custom overrides)
    for rule in VIOLATION_RULES:
        rid = rule["id"]
        override = custom.get(rid, {})
        result.append({
            "id": rid,
            "name": override.get("name", rule["name"]),
            "description": override.get("description", rule["description"]),
            "columns": override.get("columns", rule["columns"]),
            "sql": override.get("sql", VIOLATION_SQL.get(rid, "")),
            "is_custom": False,
            "is_modified": rid in custom,
            "enabled": override.get("enabled", True),
        })

    # Purely custom rules (V14+)
    for rid, data in custom.items():
        if not any(r["id"] == rid for r in VIOLATION_RULES):
            result.append({
                "id": rid,
                "name": data.get("name", rid),
                "description": data.get("description", ""),
                "columns": data.get("columns", []),
                "sql": data.get("sql", ""),
                "is_custom": True,
                "is_modified": False,
                "enabled": data.get("enabled", True),
            })

    # Sort by ID (V1, V2, ... V13, V14, ...)
    result.sort(key=lambda r: (
        int(r["id"][1:]) if r["id"][1:].isdigit() else 999,
        r["id"]
    ))
    return result


@router.put("/config/violation-rules/{rule_id}")
async def update_violation_rule(rule_id: str, update: ViolationRuleUpdate):
    """Edit a violation rule (built-in or custom). Stores override in config."""
    from core.config_store import get_custom_rules, upsert_custom_rule

    existing = get_custom_rules().get(rule_id, {})
    if update.name is not None:
        existing["name"] = update.name
    if update.description is not None:
        existing["description"] = update.description
    if update.columns is not None:
        existing["columns"] = update.columns
    if update.sql is not None:
        existing["sql"] = update.sql
    if update.enabled is not None:
        existing["enabled"] = update.enabled

    upsert_custom_rule(rule_id, existing)
    return {"status": "updated", "rule_id": rule_id}


@router.post("/config/violation-rules")
async def create_violation_rule(rule: ViolationRuleCreate):
    """Create a new custom violation rule."""
    from rules.violation_rules import VIOLATION_RULES
    from core.config_store import get_custom_rules, upsert_custom_rule

    # Check ID doesn't already exist
    existing_ids = {r["id"] for r in VIOLATION_RULES}
    existing_ids.update(get_custom_rules().keys())
    if rule.id in existing_ids:
        raise HTTPException(400, f"Rule ID '{rule.id}' already exists")

    upsert_custom_rule(rule.id, {
        "name": rule.name,
        "description": rule.description,
        "columns": rule.columns,
        "sql": rule.sql,
        "enabled": True,
        "is_custom": True,
    })
    return {"status": "created", "rule_id": rule.id}


@router.delete("/config/violation-rules/{rule_id}")
async def delete_violation_rule(rule_id: str):
    """Delete a custom rule or reset a built-in rule to defaults."""
    from rules.violation_rules import VIOLATION_RULES
    from core.config_store import delete_custom_rule

    is_builtin = any(r["id"] == rule_id for r in VIOLATION_RULES)
    deleted = delete_custom_rule(rule_id)

    if is_builtin:
        return {"status": "reset_to_default", "rule_id": rule_id}
    elif deleted:
        return {"status": "deleted", "rule_id": rule_id}
    else:
        raise HTTPException(404, f"Rule '{rule_id}' not found")


@router.post("/config/violation-rules/reset")
async def reset_all_rules():
    """Reset all violation rules to factory defaults."""
    from core.config_store import reset_custom_rules
    reset_custom_rules()
    return {"status": "reset"}


# ---------------------------------------------------------------------------
# LLM Prompts (CRUD)
# ---------------------------------------------------------------------------

# Map of prompt keys → their factory-default values (imported from agents)
def _get_default_prompts() -> dict[str, str]:
    """Lazily load default prompts from agent modules."""
    from agents.schema_mapper import SYSTEM_PROMPT as SCHEMA_PROMPT
    from agents.relationship_discoverer import SYSTEM_PROMPT as REL_PROMPT
    from agents.query_generator import SYSTEM_PROMPT as SQL_PROMPT
    return {
        "schema_mapping": SCHEMA_PROMPT,
        "relationship_discovery": REL_PROMPT,
        "sql_generation": SQL_PROMPT,
        "chat": (
            "You are a data quality assistant for AMMF (Acquirer Merchant Master File) data preparation. "
            "Help the user understand data quality issues, schema mapping gaps, and how to improve their data. "
            "The AMMF format has 31 required/optional columns for Visa's acquirer merchant compliance program.\n\n"
            "Be concise, specific, and actionable. When suggesting fixes, reference specific table names and columns."
        ),
    }


@router.get("/config/prompts")
async def get_all_prompts():
    """Return all prompt keys with their current (custom or default) values."""
    from core.config_store import get_all_prompts, PROMPT_KEYS

    defaults = _get_default_prompts()
    custom = get_all_prompts()

    result = []
    for key, display_name in PROMPT_KEYS.items():
        result.append({
            "key": key,
            "name": display_name,
            "value": custom.get(key, defaults.get(key, "")),
            "is_custom": key in custom,
            "default_value": defaults.get(key, ""),
        })
    return result


class PromptUpdate(BaseModel):
    value: str


@router.put("/config/prompts/{key}")
async def update_prompt(key: str, update: PromptUpdate):
    """Update a custom prompt override."""
    from core.config_store import set_prompt, PROMPT_KEYS

    if key not in PROMPT_KEYS:
        raise HTTPException(400, f"Unknown prompt key: {key}")
    set_prompt(key, update.value)
    return {"status": "updated", "key": key}


@router.delete("/config/prompts/{key}")
async def reset_prompt(key: str):
    """Reset a single prompt to its factory default."""
    from core.config_store import delete_prompt, PROMPT_KEYS

    if key not in PROMPT_KEYS:
        raise HTTPException(400, f"Unknown prompt key: {key}")
    delete_prompt(key)
    return {"status": "reset_to_default", "key": key}


@router.post("/config/prompts/reset")
async def reset_all_prompts():
    """Reset all prompts to factory defaults."""
    from core.config_store import reset_prompts
    reset_prompts()
    return {"status": "reset"}


# ---------------------------------------------------------------------------
# Violation Rule Testing & Resolution Strategy
# ---------------------------------------------------------------------------

class TestRuleRequest(BaseModel):
    sql: str
    job_id: str | None = None  # If provided, run against that job's AMMF data


class ResolutionStrategyRequest(BaseModel):
    rule_id: str
    rule_name: str
    description: str
    columns: list[str]
    sql: str
    sample_rows: list[dict] | None = None  # From a test run


@router.post("/config/violation-rules/test")
async def test_violation_rule(request: TestRuleRequest):
    """Test a violation rule SQL against the most recent job's AMMF data.

    Returns the row count and sample violated rows so the user can verify
    the rule catches what they expect.
    """
    from core.job_store import job_store
    from core.db_engine import DuckDBEngine

    # Find a job with AMMF data
    job = None
    if request.job_id:
        job = job_store.get_job(request.job_id)
    else:
        # Use most recent completed job
        for j in reversed(list(job_store._jobs.values())):
            if j.ammf_dataframe is not None:
                job = j
                break

    if not job or job.ammf_dataframe is None:
        raise HTTPException(
            400,
            "No AMMF data available to test against. Run the pipeline first to generate AMMF output."
        )

    # Register AMMF data as table and run the rule SQL
    try:
        job.db.conn.register("_ammf_temp", job.ammf_dataframe)
        job.db.conn.execute('CREATE OR REPLACE TABLE ammf_output AS SELECT * FROM "_ammf_temp"')
        job.db.conn.unregister("_ammf_temp")

        result_df = job.db.execute(request.sql)
        total = len(result_df)
        sample = result_df.head(10).fillna("").to_dict(orient="records")

        return {
            "status": "success",
            "total_rows_flagged": total,
            "total_ammf_rows": len(job.ammf_dataframe),
            "sample_rows": sample,
            "columns": list(result_df.columns) if total > 0 else [],
        }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "total_rows_flagged": 0,
            "total_ammf_rows": len(job.ammf_dataframe),
            "sample_rows": [],
            "columns": [],
        }


RESOLUTION_SYSTEM_PROMPT = """You are a Visa AMMF (Acquirer Merchant Master File) data quality expert.
You are analyzing a violation rule that flags non-compliant merchant data and need to produce
a resolution strategy — how to fix the flagged violations.

Your output must be actionable and specific. For each violation rule:
1. Explain the ROOT CAUSE — why does this violation typically occur in acquirer data?
2. Determine the RESOLUTION APPROACH — one of:
   - "auto_fix": Can be resolved programmatically with a SQL UPDATE (e.g., deriving values, trimming, de-duplication)
   - "web_research": Needs real-world merchant data from web lookups (addresses, legal names, tax IDs)
   - "manual_review": Requires human/acquirer judgment (e.g., which of two conflicting records is correct)
3. If auto_fix is possible, generate a DuckDB SQL UPDATE statement that fixes the violations in the `ammf_output` table.
   The UPDATE must be safe (idempotent, no data loss) and should include a WHERE clause that targets only affected rows.
4. If web_research is needed, describe what data to look up and from where.
5. If manual_review is needed, describe what decision the user needs to make.
6. Rate your CONFIDENCE (0.0-1.0) in the proposed fix.
7. List any CAVEATS or edge cases.

AMMF Context:
- 31 columns covering processor/acquirer identifiers, merchant names, addresses, MCCs, and tax IDs
- DBAName = "Doing Business As" (consumer-facing name)
- LegalName = official registered business name
- BASEIIName = name from payment transactions, required for Payment Facilitator (PF) records
- AcquirerMerchantID = unique merchant identifier (SubMerchantID for PF, AcquirerAssignedMerchantID for direct)
- CAID = Card Acceptor ID from VisaNet settlement
- AggregatorID/AggregatorName = Payment Facilitator / Marketplace identifiers

Use DuckDB SQL syntax. The table is always `ammf_output`."""


@router.post("/config/violation-rules/resolution-strategy")
async def generate_resolution_strategy(request: ResolutionStrategyRequest):
    """Use LLM to analyze a violation rule and generate a resolution strategy.

    Returns root cause analysis, remediation approach, fix SQL (if auto-fixable),
    and confidence rating.
    """
    from core.llm_client import llm_client

    # Build context from the rule
    sample_context = ""
    if request.sample_rows and len(request.sample_rows) > 0:
        sample_context = f"\n\nSAMPLE VIOLATED ROWS ({len(request.sample_rows)} shown):\n"
        for i, row in enumerate(request.sample_rows[:5]):
            # Only show relevant columns
            relevant = {k: v for k, v in row.items()
                       if k in request.columns or k in ("violation_id", "violated_column", "DBAName", "LegalName", "CAID", "AcquirerMerchantID")}
            sample_context += f"  Row {i+1}: {relevant}\n"

    user_prompt = f"""Analyze this AMMF violation rule and generate a resolution strategy:

RULE ID: {request.rule_id}
RULE NAME: {request.rule_name}
DESCRIPTION: {request.description}
AFFECTED COLUMNS: {', '.join(request.columns)}

VIOLATION SQL (DuckDB):
{request.sql}
{sample_context}

Generate a resolution strategy with:
1. root_cause: Why this violation typically occurs (2-3 sentences)
2. approach: One of "auto_fix", "web_research", or "manual_review"
3. fix_sql: If approach is "auto_fix", a DuckDB UPDATE statement to fix it. Otherwise null.
4. fix_explanation: Step-by-step explanation of what the fix does
5. web_research_guidance: If approach is "web_research", what to look up and where
6. manual_review_guidance: If approach is "manual_review", what decision the user must make
7. confidence: 0.0-1.0 confidence in the fix
8. caveats: List of edge cases or warnings"""

    output_schema = {
        "type": "object",
        "properties": {
            "root_cause": {
                "type": "string",
                "description": "Why this violation typically occurs in acquirer data"
            },
            "approach": {
                "type": "string",
                "enum": ["auto_fix", "web_research", "manual_review"],
                "description": "Recommended resolution approach"
            },
            "fix_sql": {
                "type": ["string", "null"],
                "description": "DuckDB UPDATE statement to fix violations (null if not auto-fixable)"
            },
            "fix_explanation": {
                "type": "string",
                "description": "Step-by-step explanation of the resolution"
            },
            "web_research_guidance": {
                "type": ["string", "null"],
                "description": "What to look up and where, if web research is needed"
            },
            "manual_review_guidance": {
                "type": ["string", "null"],
                "description": "What decision the user needs to make"
            },
            "confidence": {
                "type": "number",
                "description": "Confidence in the proposed fix (0.0-1.0)"
            },
            "caveats": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Edge cases or warnings"
            },
        },
        "required": ["root_cause", "approach", "fix_sql", "fix_explanation", "confidence", "caveats"],
    }

    try:
        result = llm_client.structured_query(
            RESOLUTION_SYSTEM_PROMPT,
            user_prompt,
            output_schema,
            label=f"Resolution Strategy: {request.rule_id}",
        )
        return {
            "status": "success",
            "rule_id": request.rule_id,
            **result,
        }
    except Exception as e:
        raise HTTPException(500, f"Failed to generate resolution strategy: {e}")


# ---------------------------------------------------------------------------
# AI Rule Generator
# ---------------------------------------------------------------------------

RULE_GENERATOR_SYSTEM_PROMPT = """You are a Visa AMMF (Acquirer Merchant Master File) data quality expert.
Your task is to generate a DuckDB SQL query that detects a specific data quality violation
in the `ammf_output` table.

AMMF TABLE SCHEMA — the `ammf_output` table has these columns:
  ProcessorBINCIB, ProcessorName, AcquirerBID, AcquirerName, AcquirerBIN,
  AcquirerMerchantID, CAID, DBAName, LegalName, BASEIIName,
  Street, City, StateProvinceCode, PostalCode, LocationCountry,
  MCC1, MCC2, MCC3, MCC4, MCC5, MCC6, MCC7, MCC8, MCC9,
  AggregatorID, AggregatorName, BusinessRegistrationID,
  SubMerchantID, AcquirerAssignedMerchantID, MerchantType

DQ RULE PATTERNS:
- Simple value checks: WHERE TRIM(col) = '' OR col IS NULL
- Cross-column checks: WHERE LOWER(TRIM(col1)) = LOWER(TRIM(col2))
- Pattern checks: WHERE NOT regexp_matches(col, 'pattern')
- Group checks (CTEs): WITH groups AS (SELECT ... GROUP BY ... HAVING COUNT(*) > 1)
- Fuzzy matching: jaro_winkler_similarity(a, b) > threshold
- Always include: SELECT *, 'Vxx' AS violation_id FROM ammf_output WHERE ...
- The query must RETURN rows that VIOLATE the rule (i.e., the bad rows).
- Use DuckDB SQL syntax.

EXISTING RULES (for reference — do NOT duplicate these):
- V1: Acquirer name appears in DBAName/LegalName/BASEIIName
- V2: Street and City values are identical
- V3: Same MID+CAID+DBA but multiple different addresses
- V4: Invalid/suspicious address patterns (PO Box numbers, single chars)
- V5: Invalid BASEIIName for PF/sub-merchant records
- V6: ProcessorBINCIB/AcquirerBID/AcquirerBIN copied from AcquirerName
- V7: Invalid CAID (too short, all zeros, non-numeric)
- V8: Same address used by many different MIDs (address farming)
- V9: Invalid BusinessRegistrationID (too short, all same digits, sequential)
- V10: Same MID+CAID but different DBAName/LegalName
- V11: Multiple different MIDs sharing a single CAID
- V12: BASEIIName copied to DBAName or LegalName (identical values)
- V13: Sub-merchants under same aggregator sharing identical tax IDs

Generate a NEW rule that is DIFFERENT from the above. Be creative and think about
real data quality issues that acquirers encounter with merchant data."""


class GenerateRuleRequest(BaseModel):
    description: str  # Natural language description of what to check
    refinement: str | None = None  # Optional: "also check X" or "change Y"
    previous_sql: str | None = None  # If refining, the previous SQL
    previous_name: str | None = None
    previous_columns: list[str] | None = None


@router.post("/config/violation-rules/generate")
async def generate_violation_rule(request: GenerateRuleRequest):
    """Use LLM to generate a complete violation rule from a natural language description.

    Supports both initial generation and iterative refinement.
    """
    from core.llm_client import llm_client

    if request.refinement and request.previous_sql:
        user_prompt = f"""Refine this existing violation rule:

CURRENT RULE NAME: {request.previous_name or 'Unnamed'}
CURRENT AFFECTED COLUMNS: {', '.join(request.previous_columns or [])}
CURRENT SQL:
{request.previous_sql}

USER'S REFINEMENT REQUEST:
{request.refinement}

Generate an updated version of this rule incorporating the user's feedback.
Keep what works, modify what the user asked to change."""
    else:
        user_prompt = f"""Generate a violation rule for the following check:

USER'S DESCRIPTION:
{request.description}

Create a complete violation rule with:
1. A concise rule name (like "Invalid Phone Format" or "Duplicate Merchant Entries")
2. A clear description of what the rule detects
3. The list of AMMF columns this rule examines
4. A DuckDB SQL SELECT query that returns the violating rows from `ammf_output`

The SQL must:
- Start with SELECT *, 'Vxx' AS violation_id (use a placeholder ID)
- Return rows that VIOLATE the rule (bad data)
- Use DuckDB syntax (supports regexp_matches, jaro_winkler_similarity, etc.)
- Be efficient and handle NULLs properly"""

    output_schema = {
        "type": "object",
        "properties": {
            "name": {
                "type": "string",
                "description": "Short, descriptive rule name (e.g., 'Invalid Phone Format')"
            },
            "description": {
                "type": "string",
                "description": "Clear description of what this rule detects and why it matters"
            },
            "columns": {
                "type": "array",
                "items": {"type": "string"},
                "description": "List of AMMF columns this rule examines"
            },
            "sql": {
                "type": "string",
                "description": "DuckDB SQL query that returns violating rows from ammf_output"
            },
            "explanation": {
                "type": "string",
                "description": "Step-by-step explanation of what the SQL does and why"
            },
            "suggested_id": {
                "type": "string",
                "description": "Suggested rule ID like V14, V15, etc."
            },
        },
        "required": ["name", "description", "columns", "sql", "explanation", "suggested_id"],
    }

    try:
        result = llm_client.structured_query(
            RULE_GENERATOR_SYSTEM_PROMPT,
            user_prompt,
            output_schema,
            label="AI Rule Generator",
        )
        return {"status": "success", **result}
    except Exception as e:
        raise HTTPException(500, f"Failed to generate rule: {e}")


# ---------------------------------------------------------------------------
# Aggregate LLM Stats
# ---------------------------------------------------------------------------

@router.get("/config/llm-stats")
async def get_llm_stats():
    """Return aggregate LLM usage stats across all live jobs."""
    from core.job_store import job_store

    all_calls = []
    per_job = []

    for job_id, job in job_store._jobs.items():
        logs = getattr(job, "llm_call_logs", [])
        if not logs:
            continue
        job_input = sum(getattr(l, "input_tokens", 0) for l in logs)
        job_output = sum(getattr(l, "output_tokens", 0) for l in logs)
        job_cost = sum(getattr(l, "cost_usd", 0.0) for l in logs)
        job_duration = sum(getattr(l, "duration_ms", 0) for l in logs)
        per_job.append({
            "job_id": job_id,
            "calls": len(logs),
            "input_tokens": job_input,
            "output_tokens": job_output,
            "cost_usd": round(job_cost, 6),
            "duration_ms": job_duration,
            "started_at": job.started_at,
        })
        all_calls.extend(logs)

    # Per-label breakdown
    label_stats: dict[str, dict] = {}
    for log in all_calls:
        lbl = getattr(log, "label", None) or getattr(log, "method", "unknown")
        if lbl not in label_stats:
            label_stats[lbl] = {"calls": 0, "input_tokens": 0, "output_tokens": 0, "cost_usd": 0.0, "errors": 0}
        label_stats[lbl]["calls"] += 1
        label_stats[lbl]["input_tokens"] += getattr(log, "input_tokens", 0)
        label_stats[lbl]["output_tokens"] += getattr(log, "output_tokens", 0)
        label_stats[lbl]["cost_usd"] += getattr(log, "cost_usd", 0.0)
        if getattr(log, "error", None):
            label_stats[lbl]["errors"] += 1

    # Round costs
    for v in label_stats.values():
        v["cost_usd"] = round(v["cost_usd"], 6)

    total_input = sum(getattr(l, "input_tokens", 0) for l in all_calls)
    total_output = sum(getattr(l, "output_tokens", 0) for l in all_calls)
    total_cost = sum(getattr(l, "cost_usd", 0.0) for l in all_calls)
    total_duration = sum(getattr(l, "duration_ms", 0) for l in all_calls)

    # Recent calls (last 20)
    recent = sorted(all_calls, key=lambda l: getattr(l, "timestamp", 0), reverse=True)[:20]

    return {
        "total_calls": len(all_calls),
        "total_input_tokens": total_input,
        "total_output_tokens": total_output,
        "total_cost_usd": round(total_cost, 6),
        "total_duration_ms": total_duration,
        "jobs_with_calls": len(per_job),
        "per_label": label_stats,
        "per_job": per_job,
        "recent_calls": [l.to_dict() for l in recent],
    }


# ---------------------------------------------------------------------------
# Mapping Templates (CRUD)
# ---------------------------------------------------------------------------

@router.get("/config/mapping-templates")
async def get_mapping_templates():
    """Return all saved mapping templates."""
    from core.config_store import get_all_mapping_templates
    templates = get_all_mapping_templates()
    result = []
    for fp, data in templates.items():
        result.append({
            "fingerprint": fp,
            "name": data.get("name", f"Template {fp[:8]}"),
            "created_at": data.get("created_at", ""),
            "table_summary": data.get("table_summary", {}),
            "has_user_instructions": bool(data.get("user_instructions")),
            "violation_count": len(data.get("selected_violations", []) or []),
        })
    result.sort(key=lambda t: t["created_at"], reverse=True)
    return result


@router.delete("/config/mapping-templates/{fingerprint}")
async def delete_mapping_template_endpoint(fingerprint: str):
    """Delete a saved mapping template."""
    from core.config_store import delete_mapping_template
    if delete_mapping_template(fingerprint):
        return {"status": "deleted", "fingerprint": fingerprint}
    raise HTTPException(404, f"Template not found: {fingerprint[:16]}...")


@router.post("/config/mapping-templates/reset")
async def reset_all_mapping_templates():
    """Delete all saved mapping templates."""
    from core.config_store import reset_mapping_templates
    reset_mapping_templates()
    return {"status": "reset"}
