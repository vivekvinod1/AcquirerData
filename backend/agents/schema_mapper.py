"""Schema Mapper Agent - Uses Claude to map arbitrary acquirer columns to AMMF fields."""

from core.job_store import Job
from core.llm_client import llm_client
from core.file_parser import get_schema_summary
from core.models import SchemaMapping, ColumnMapping, MappingCandidate, DataDictionaryEntry
from rules.ammf_spec import get_ammf_spec_for_prompt, AMMF_COLUMNS

SYSTEM_PROMPT = """You are a data integration expert specializing in Visa's AMMF (Acquirer Merchant Master File) format.
Your task is to analyze source data schemas from an acquirer and map each source column to the appropriate AMMF output column.

MAPPING PRIORITY:
1. **Data Dictionary (PRIMARY)**: When a DATA DICTIONARY is provided, use column descriptions as the PRIMARY mapping signal. These descriptions are authoritative — they define what each source column actually contains. Match AMMF column semantics against these descriptions first.
2. **Column Names (SECONDARY)**: Use column name similarity as a secondary signal. Look for semantic matches, not just exact name matches (e.g., "merchant_name" could map to DBAName, "tax_number" to BusinessRegistrationID).
3. **Sample Values (SUPPLEMENTARY)**: Use sample values and data types to validate and disambiguate matches.

CANDIDATE RANKING — for each AMMF column, return up to 5 candidate source columns, ranked best-first:
- Rank by: (1) Data dictionary semantic match — if a dictionary description clearly describes the same concept as the AMMF column, that candidate ranks highest. (2) Overall confidence considering column name similarity, data type compatibility, sample value patterns, and null rate (lower null % is better).
- The FIRST candidate in your list must be your STRONGEST recommendation.
- Include alternatives when multiple source columns could plausibly match the same AMMF field.
- If only one good match exists, return just that one candidate.

KEY RULES:
- Each AMMF column should map to at most one source column (or be derived from a combination).
- The number and structure of source tables varies per acquirer — sometimes 3 tables, sometimes 12+. Analyze ALL provided tables carefully.
- Some AMMF columns are derived conditionally (e.g., AcquirerMerchantID comes from SubMerchantID for PF merchants, or AcquirerAssignedMerchantID for direct merchants).
- BASEIIName is derived: for PF records it's typically AggregatorName + DBA variant; for direct records it's NULL.
- For ProcessorBINCIB, ProcessorName, AcquirerBID, AcquirerName, AcquirerBIN: look for these in the actual uploaded data. They may exist as columns in a reference/master table (e.g., a table with "bin", "cib", "bid", "master" in its name), or they may be columns in the main merchant data itself. Map them to whichever source table and column they actually appear in. Only mark as is_derived=true if they genuinely need computation.
- MCC1 maps from the primary MCC field. MCC2-MCC9 are typically left blank unless source data contains secondary MCC fields.
- LocationCountry maps from a country code field.
- Provide a confidence score (0.0-1.0) and reasoning for each candidate.
- Mark columns as is_derived=true if they require conditional logic or computation rather than a direct column copy.
- Do NOT assume any fixed table names or structures — base all mappings on what you actually see in the source data."""


async def run_schema_mapping(job: Job) -> SchemaMapping:
    schema_summary = get_schema_summary(job.tables)
    ammf_spec = get_ammf_spec_for_prompt()

    # Build data dictionary context if available
    dict_context = _format_data_dictionary(job.data_dictionary) if job.data_dictionary else None

    # Build user prompt with dictionary prioritized
    dict_section = ""
    if dict_context:
        dict_section = f"""DATA DICTIONARY (PRIMARY MAPPING SIGNAL — use these descriptions as the authoritative source for what each column contains):
{dict_context}

"""
    else:
        dict_section = """NOTE: No data dictionary was provided with this upload. Use column names, data types, and sample values to infer mappings.

"""

    user_prompt = f"""Analyze the following source data and map columns to the AMMF output format.

There are {len(schema_summary)} source table(s). Study ALL of them — some may be merchant data, others may be reference/master tables containing processor, acquirer, BIN, CIB, or BID information.

{dict_section}SOURCE DATA SCHEMAS (column names, types, null rates, sample values):
{_format_schema_summary(schema_summary)}

TARGET FORMAT:
{ammf_spec}

For each of the 31 AMMF columns, return up to 5 candidate source columns ranked best-first:
1. The first candidate is your strongest recommendation (the default mapping).
2. Include alternatives when multiple source columns could plausibly map to the same AMMF field.
3. For each candidate: which source table and column, confidence (0.0-1.0), reasoning, and whether it's derived.

Important:
- For ProcessorBINCIB, ProcessorName, AcquirerBID, AcquirerName, AcquirerBIN: look at the actual source tables above. If a reference/master table contains these values, map them to that table and column directly.
- MCC2-MCC9 should be left unmapped unless secondary MCC columns exist in the source data.
- Do NOT hardcode any table names — only reference tables you can see in the source data above."""

    output_schema = {
        "type": "object",
        "properties": {
            "mappings": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "ammf_column": {"type": "string"},
                        "candidates": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "source_table": {"type": ["string", "null"]},
                                    "source_column": {"type": ["string", "null"]},
                                    "confidence": {"type": "number"},
                                    "reasoning": {"type": "string"},
                                    "is_derived": {"type": "boolean"},
                                    "derivation_logic": {"type": "string"},
                                },
                                "required": ["confidence", "reasoning"],
                            },
                            "minItems": 1,
                            "maxItems": 5,
                        },
                    },
                    "required": ["ammf_column", "candidates"],
                },
            }
        },
        "required": ["mappings"],
    }

    from core.config_store import get_prompt
    system = get_prompt("schema_mapping", SYSTEM_PROMPT)
    result = llm_client.structured_query(system, user_prompt, output_schema, label="Schema Mapping")

    mappings = []
    mapped_ammf_cols = set()
    for m in result["mappings"]:
        candidates = m.get("candidates", [])
        if not candidates:
            continue

        # First candidate = best recommendation (primary mapping)
        best = candidates[0]
        # Remaining candidates = alternatives
        alternatives = []
        for alt in candidates[1:]:
            alternatives.append(MappingCandidate(
                source_table=alt.get("source_table"),
                source_column=alt.get("source_column"),
                confidence=alt.get("confidence", 0.0),
                reasoning=alt.get("reasoning", ""),
                is_derived=alt.get("is_derived", False),
                derivation_logic=alt.get("derivation_logic", ""),
            ))

        mapping = ColumnMapping(
            ammf_column=m["ammf_column"],
            source_table=best.get("source_table"),
            source_column=best.get("source_column"),
            confidence=best.get("confidence", 0.0),
            reasoning=best.get("reasoning", ""),
            is_derived=best.get("is_derived", False),
            derivation_logic=best.get("derivation_logic", ""),
            alternatives=alternatives,
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


def _format_data_dictionary(entries: list[DataDictionaryEntry]) -> str:
    """Format data dictionary entries for inclusion in the LLM prompt."""
    lines = [f"Data Dictionary ({len(entries)} entries):"]
    for entry in entries:
        parts = [f"  - {entry.column_name}"]
        meta = []
        if entry.source_table:
            meta.append(f"table: {entry.source_table}")
        if entry.data_type:
            meta.append(f"type: {entry.data_type}")
        if meta:
            parts.append(f" ({', '.join(meta)})")
        parts.append(f': "{entry.description}"')
        lines.append("".join(parts))
    return "\n".join(lines)


def _format_schema_summary(summary: dict) -> str:
    lines = []
    for table_name, info in summary.items():
        lines.append(f"\nTable: {table_name} ({info['row_count']} rows)")
        lines.append("Columns:")
        for col in info["columns"]:
            samples = ", ".join(col["sample_values"][:3])
            null_pct = round(col["null_count"] / max(info["row_count"], 1) * 100, 1)
            lines.append(
                f"  - {col['name']} ({col['dtype']}, {null_pct}% null, "
                f"{col['distinct_count']} distinct) e.g.: {samples}"
            )
        lines.append("Sample rows (first 3):")
        for i, row in enumerate(info["sample_data"][:3]):
            lines.append(f"  Row {i}: {row}")
    return "\n".join(lines)
