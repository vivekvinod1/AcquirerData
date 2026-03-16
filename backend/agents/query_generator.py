"""Query Generator Agent - Uses Claude to generate DuckDB SQL for AMMF transformation."""

from core.job_store import Job
from core.llm_client import llm_client
from core.file_parser import get_schema_summary
from rules.ammf_spec import get_ammf_spec_for_prompt, AMMF_COLUMN_NAMES
import json

SYSTEM_PROMPT = """You are a SQL expert generating DuckDB SQL queries to transform raw acquirer data into Visa's AMMF format.

CRITICAL RULES:
1. Generate a single SELECT statement (with CTEs if needed) that produces exactly 31 columns in the AMMF format.
2. The output column names MUST exactly match the AMMF spec column names.
3. Use DuckDB SQL syntax (not PostgreSQL or MySQL).
4. Handle NULL values appropriately — use COALESCE where needed.
5. For derived columns:
   - AcquirerMerchantID: Use SubMerchantID from aggregator file for PF records, else AcquirerAssignedMerchantID
   - BASEIIName: For PF records (where AggregatorName IS NOT NULL), construct as "AggregatorName - DBAVariant". For direct records, NULL.
   - LocationCountry: Map from country code field
   - MCC1: From primary MCC field
   - MCC2-MCC9: NULL (leave blank)
6. ProcessorBINCIB, ProcessorName, AcquirerBID, AcquirerName, AcquirerBIN: use the values specified in the PROCESSOR / ACQUIRER VALUES section below. These may come from user selection, auto-detection from a reference table, or a JOIN to a reference table. Follow the instructions in that section.
7. Use LEFT JOINs for optional tables (aggregator, reference tables).
8. Ensure NO duplicate rows — use DISTINCT or appropriate grouping.
9. Table and column names with spaces must be quoted with double quotes.
10. Return ONLY the SQL query, no explanation outside it."""


def _auto_detect_cib_bin(job: Job) -> dict:
    """Try to detect CIB/BIN/BID values from reference tables in the uploaded data.

    Looks for tables with 'bin', 'cib', 'bid', 'master', 'processor', 'acquirer'
    in their name, then scans columns for matching patterns.
    """
    import re

    patterns = {
        "processor_name": re.compile(r"processor.?name|proc.?name|cib.?name", re.I),
        "processor_bin_cib": re.compile(r"processor.?bin.?cib|processor.?cib|cib$|cib.?id|proc.?cib", re.I),
        "acquirer_name": re.compile(r"acquirer.?name|acq.?name|bid.?name", re.I),
        "acquirer_bid": re.compile(r"acquirer.?bid|bid$|bid.?id|acq.?bid|business.?id", re.I),
        "acquirer_bin": re.compile(r"acquirer.?bin|bin$|bin.?id|acq.?bin|acquiring.?bin", re.I),
    }

    ref_pat = re.compile(r"bin|cib|bid|master|processor|acquirer|reference|ref", re.I)

    # Search reference-like tables first, then all tables
    ref_tables = {n: df for n, df in job.tables.items() if ref_pat.search(n)}
    other_tables = {n: df for n, df in job.tables.items() if n not in ref_tables}
    search_order = list(ref_tables.items()) + list(other_tables.items())

    detected: dict = {}
    for field_key, pat in patterns.items():
        for table_name, df in search_order:
            for col in df.columns:
                if pat.search(str(col)):
                    vals = df[col].dropna()
                    if len(vals) == 0:
                        continue
                    # Pick most common non-empty value
                    val = vals.astype(str).str.strip()
                    val = val[val != ""]
                    if len(val) == 0:
                        continue
                    most_common = val.mode().iloc[0] if len(val.mode()) > 0 else val.iloc[0]
                    # Try to cast numeric fields
                    if field_key in ("processor_bin_cib", "acquirer_bid", "acquirer_bin"):
                        try:
                            detected[field_key] = int(float(most_common))
                        except (ValueError, TypeError):
                            detected[field_key] = most_common
                    else:
                        detected[field_key] = most_common
                    break
            if field_key in detected:
                break

    return detected


async def run_query_generation(job: Job, relationships: dict, max_retries: int = 3) -> str:
    schema_summary = get_schema_summary(job.tables)
    ammf_spec = get_ammf_spec_for_prompt()

    # Get CIB/BIN config — user-supplied takes priority, then auto-detect from data
    cib_config = job.cib_bin_config or {}

    # Auto-detect from uploaded reference tables if user didn't provide values
    auto_detected = _auto_detect_cib_bin(job)
    if auto_detected:
        job.add_message(f"Auto-detected CIB/BIN values from data: {auto_detected}")

    # Merge: user config overrides auto-detected; auto-detected overrides defaults
    processor_name = cib_config.get("processor_name") or auto_detected.get("processor_name", "")
    processor_cib = cib_config.get("processor_bin_cib") or auto_detected.get("processor_bin_cib", 0)
    acquirer_name = cib_config.get("acquirer_name") or auto_detected.get("acquirer_name", "")
    acquirer_bid = cib_config.get("acquirer_bid") or auto_detected.get("acquirer_bid", 0)
    acquirer_bin = cib_config.get("acquirer_bin") or auto_detected.get("acquirer_bin", 0)

    # Format schema mapping for context
    mapping_context = ""
    if job.schema_mapping:
        mapping_lines = []
        for m in job.schema_mapping.mappings:
            if m.source_column:
                mapping_lines.append(f"  {m.ammf_column} <- {m.source_table}.{m.source_column}")
            elif m.is_derived:
                mapping_lines.append(f"  {m.ammf_column} <- DERIVED: {m.derivation_logic}")
        mapping_context = "\n".join(mapping_lines)

    # Build the CIB/BIN instruction block
    has_values = processor_name or processor_cib or acquirer_name or acquirer_bid or acquirer_bin
    if has_values:
        cib_block = f"""PROCESSOR / ACQUIRER VALUES (use these in the generated SQL):
- ProcessorBINCIB: {processor_cib}
- ProcessorName: '{processor_name}'
- AcquirerBID: {acquirer_bid}
- AcquirerName: '{acquirer_name}'
- AcquirerBIN: {acquirer_bin}

These values were {'user-configured' if cib_config else 'auto-detected from the reference data'}.
Use them as constants in the SELECT clause. Do NOT default to 0 or 'UNKNOWN'."""
    else:
        cib_block = """PROCESSOR / ACQUIRER VALUES:
No values were provided or auto-detected. You MUST look for a reference table
(containing columns like CIB, BIN, BID, ProcessorName, AcquirerName) in the source
tables listed above. JOIN to it and extract the correct values.
If absolutely no reference data exists, use NULL (not 0 or 'UNKNOWN')."""

    # Include user instructions if provided during review
    user_notes_block = ""
    if getattr(job, "user_instructions", None) and job.user_instructions.strip():
        user_notes_block = f"""
USER INSTRUCTIONS (the user provided these notes during review — follow them carefully):
{job.user_instructions.strip()}
"""

    user_prompt = f"""Generate a DuckDB SQL query to transform the source tables into AMMF format.

SOURCE TABLES:
{_format_schema(schema_summary)}

COLUMN MAPPINGS (from schema analysis):
{mapping_context}

RELATIONSHIPS:
{json.dumps(relationships.get('joins', []), indent=2)}
Main table: {relationships.get('main_table', 'unknown')}

{cib_block}
{user_notes_block}
TARGET FORMAT:
{ammf_spec}

OUTPUT COLUMN ORDER (must be exactly this):
{', '.join(AMMF_COLUMN_NAMES)}

Generate a complete DuckDB SQL query. If there is a bin/CIB reference table available, use it to get the processor/acquirer values. Do NOT use 0 or 'UNKNOWN' as default values — use the detected/configured values or NULL. Remember: MCC2-MCC9 should be NULL."""

    sql = None
    last_error = None

    from core.config_store import get_prompt
    system = get_prompt("sql_generation", SYSTEM_PROMPT)

    for attempt in range(max_retries):
        try:
            if last_error:
                retry_prompt = (
                    f"{user_prompt}\n\nPREVIOUS ATTEMPT FAILED WITH ERROR:\n{last_error}\n"
                    f"Please fix the SQL to resolve this error."
                )
                sql = llm_client.sql_query(system, retry_prompt, label=f"SQL Generation (Retry {attempt + 1})")
            else:
                sql = llm_client.sql_query(system, user_prompt, label="SQL Generation")

            # Validate by executing
            job.db.execute(f"SELECT * FROM ({sql}) LIMIT 1")
            return sql

        except Exception as e:
            last_error = str(e)
            job.add_message(f"Query generation attempt {attempt + 1} failed: {last_error}")

    raise RuntimeError(f"Failed to generate valid SQL after {max_retries} attempts. Last error: {last_error}")


def _format_schema(summary: dict) -> str:
    lines = []
    for table_name, info in summary.items():
        cols = ", ".join(f"{c['name']} ({c['dtype']})" for c in info["columns"])
        lines.append(f"Table '{table_name}' ({info['row_count']} rows): {cols}")
    return "\n".join(lines)
