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
6. ProcessorBINCIB, ProcessorName, AcquirerBID, AcquirerName, AcquirerBIN are user-configured constants — use the provided values.
7. Use LEFT JOINs for optional tables (aggregator, reference tables).
8. Ensure NO duplicate rows — use DISTINCT or appropriate grouping.
9. Table and column names with spaces must be quoted with double quotes.
10. Return ONLY the SQL query, no explanation outside it."""


async def run_query_generation(job: Job, relationships: dict, max_retries: int = 3) -> str:
    schema_summary = get_schema_summary(job.tables)
    ammf_spec = get_ammf_spec_for_prompt()

    # Get CIB/BIN config
    cib_config = job.cib_bin_config or {}
    processor_name = cib_config.get("processor_name", "'UNKNOWN'")
    processor_cib = cib_config.get("processor_bin_cib", 0)
    acquirer_name = cib_config.get("acquirer_name", "'UNKNOWN'")
    acquirer_bid = cib_config.get("acquirer_bid", 0)
    acquirer_bin = cib_config.get("acquirer_bin", 0)

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

    user_prompt = f"""Generate a DuckDB SQL query to transform the source tables into AMMF format.

SOURCE TABLES:
{_format_schema(schema_summary)}

COLUMN MAPPINGS (from schema analysis):
{mapping_context}

RELATIONSHIPS:
{json.dumps(relationships.get('joins', []), indent=2)}
Main table: {relationships.get('main_table', 'unknown')}

USER-CONFIGURED VALUES:
- ProcessorBINCIB: {processor_cib}
- ProcessorName: '{processor_name}'
- AcquirerBID: {acquirer_bid}
- AcquirerName: '{acquirer_name}'
- AcquirerBIN: {acquirer_bin}

TARGET FORMAT:
{ammf_spec}

OUTPUT COLUMN ORDER (must be exactly this):
{', '.join(AMMF_COLUMN_NAMES)}

Generate a complete DuckDB SQL query. If there is a bin/CIB reference table available, use it to get the processor/acquirer values (pick one row per merchant or use user-configured constants). Remember: MCC2-MCC9 should be NULL."""

    sql = None
    last_error = None

    for attempt in range(max_retries):
        try:
            if last_error:
                retry_prompt = (
                    f"{user_prompt}\n\nPREVIOUS ATTEMPT FAILED WITH ERROR:\n{last_error}\n"
                    f"Please fix the SQL to resolve this error."
                )
                sql = llm_client.sql_query(SYSTEM_PROMPT, retry_prompt)
            else:
                sql = llm_client.sql_query(SYSTEM_PROMPT, user_prompt)

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
