"""Schema Mapper Agent - Uses Claude to map arbitrary acquirer columns to AMMF fields."""

from core.job_store import Job
from core.llm_client import llm_client
from core.file_parser import get_schema_summary
from core.models import SchemaMapping, ColumnMapping
from rules.ammf_spec import get_ammf_spec_for_prompt, AMMF_COLUMNS

SYSTEM_PROMPT = """You are a data integration expert specializing in Visa's AMMF (Acquirer Merchant Master File) format.
Your task is to analyze source data schemas from an acquirer and map each source column to the appropriate AMMF output column.

Key rules:
- Each AMMF column should map to at most one source column (or be derived from a combination).
- Some AMMF columns are derived conditionally (e.g., AcquirerMerchantID comes from SubMerchantID for PF merchants, or AcquirerAssignedMerchantID for direct merchants).
- BASEIIName is derived: for PF records it's AggregatorName + DBA variant; for direct records it's NULL.
- ProcessorBINCIB, ProcessorName, AcquirerBID, AcquirerName, AcquirerBIN come from a processor/BIN reference table — they are user-configured, not mapped from merchant data.
- MCC1 maps from the primary MCC field. MCC2-MCC9 are left blank.
- LocationCountry maps from a country code field.
- Look for semantic matches, not just exact name matches. For example, "merchant_name" could map to DBAName, "tax_number" to BusinessRegistrationID, etc.
- Provide a confidence score (0.0-1.0) and reasoning for each mapping.
- Mark columns as is_derived=true if they require conditional logic or computation rather than a direct column copy."""


async def run_schema_mapping(job: Job) -> SchemaMapping:
    schema_summary = get_schema_summary(job.tables)
    ammf_spec = get_ammf_spec_for_prompt()

    user_prompt = f"""Analyze the following source data tables and map their columns to the AMMF output format.

SOURCE DATA SCHEMAS:
{_format_schema_summary(schema_summary)}

TARGET FORMAT:
{ammf_spec}

For each of the 31 AMMF columns, determine:
1. Which source table and column maps to it (if any)
2. Whether it's a direct mapping or derived
3. Your confidence level (0.0-1.0)
4. Reasoning for the mapping

Note: ProcessorBINCIB, ProcessorName, AcquirerBID, AcquirerName, AcquirerBIN are user-configured from a reference table. Mark these as is_derived=true with derivation_logic="user_configured_from_bin_master".
MCC2-MCC9 should be left unmapped (they are optional and will be blank)."""

    output_schema = {
        "type": "object",
        "properties": {
            "mappings": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "ammf_column": {"type": "string"},
                        "source_table": {"type": ["string", "null"]},
                        "source_column": {"type": ["string", "null"]},
                        "confidence": {"type": "number"},
                        "reasoning": {"type": "string"},
                        "is_derived": {"type": "boolean"},
                        "derivation_logic": {"type": "string"},
                    },
                    "required": ["ammf_column", "confidence", "reasoning"],
                },
            }
        },
        "required": ["mappings"],
    }

    result = llm_client.structured_query(SYSTEM_PROMPT, user_prompt, output_schema)

    mappings = []
    mapped_ammf_cols = set()
    for m in result["mappings"]:
        mapping = ColumnMapping(
            ammf_column=m["ammf_column"],
            source_table=m.get("source_table"),
            source_column=m.get("source_column"),
            confidence=m.get("confidence", 0.0),
            reasoning=m.get("reasoning", ""),
            is_derived=m.get("is_derived", False),
            derivation_logic=m.get("derivation_logic", ""),
        )
        mappings.append(mapping)
        mapped_ammf_cols.add(m["ammf_column"])

    # Identify unmapped columns
    unmapped_required = []
    unmapped_optional = []
    for col in AMMF_COLUMNS:
        if col["name"] not in mapped_ammf_cols:
            if col["required"] is True:
                unmapped_required.append(col["name"])
            else:
                unmapped_optional.append(col["name"])

    return SchemaMapping(
        mappings=mappings,
        unmapped_required=unmapped_required,
        unmapped_optional=unmapped_optional,
    )


def _format_schema_summary(summary: dict) -> str:
    lines = []
    for table_name, info in summary.items():
        lines.append(f"\nTable: {table_name} ({info['row_count']} rows)")
        lines.append("Columns:")
        for col in info["columns"]:
            samples = ", ".join(col["sample_values"][:3])
            lines.append(
                f"  - {col['name']} ({col['dtype']}, {col['null_count']} nulls, "
                f"{col['distinct_count']} distinct) e.g.: {samples}"
            )
        lines.append("Sample rows (first 3):")
        for i, row in enumerate(info["sample_data"][:3]):
            lines.append(f"  Row {i}: {row}")
    return "\n".join(lines)
