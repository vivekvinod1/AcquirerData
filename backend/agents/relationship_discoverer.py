"""Relationship Discoverer Agent - Uses Claude to identify PKs, FKs, and join paths."""

from core.job_store import Job
from core.llm_client import llm_client
from core.file_parser import get_schema_summary

SYSTEM_PROMPT = """You are a database expert analyzing multiple data tables to discover their relationships.
Your task is to identify:
1. The primary key(s) for each table
2. Foreign key relationships between tables
3. The recommended join path to combine all tables

Key considerations:
- Look for columns with matching names or semantically similar names across tables
- Check cardinality: a column with unique values in one table that appears as non-unique in another suggests a PK-FK relationship
- The goal is to join all tables into a single denormalized view for AMMF output
- The main/fact table is typically the one with merchant-level records
- Reference/lookup tables have fewer rows and provide enrichment data
- Some joins may be conditional (e.g., aggregator tables only apply to PF/sub-merchant records)"""


async def run_relationship_discovery(job: Job) -> dict:
    schema_summary = get_schema_summary(job.tables)

    user_prompt = f"""Analyze the following tables and identify their relationships:

{_format_tables(schema_summary)}

For each table, identify:
1. Primary key column(s)
2. Foreign keys pointing to other tables
3. The join type (INNER, LEFT, CROSS) and join condition

Return a structured join plan showing how to combine all tables into a single output."""

    output_schema = {
        "type": "object",
        "properties": {
            "tables": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "primary_keys": {"type": "array", "items": {"type": "string"}},
                        "role": {"type": "string", "description": "fact, dimension, reference, or bridge"},
                    },
                    "required": ["name", "primary_keys", "role"],
                },
            },
            "joins": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "left_table": {"type": "string"},
                        "right_table": {"type": "string"},
                        "join_type": {"type": "string"},
                        "left_key": {"type": "string"},
                        "right_key": {"type": "string"},
                        "condition_note": {"type": "string"},
                    },
                    "required": ["left_table", "right_table", "join_type", "left_key", "right_key"],
                },
            },
            "main_table": {"type": "string", "description": "The primary fact table to start joins from"},
            "join_order_explanation": {"type": "string"},
        },
        "required": ["tables", "joins", "main_table"],
    }

    return llm_client.structured_query(SYSTEM_PROMPT, user_prompt, output_schema)


def _format_tables(summary: dict) -> str:
    lines = []
    for table_name, info in summary.items():
        lines.append(f"\nTable: {table_name} ({info['row_count']} rows)")
        for col in info["columns"]:
            uniq = "UNIQUE" if col["distinct_count"] == info["row_count"] else f"{col['distinct_count']} distinct"
            samples = ", ".join(col["sample_values"][:3])
            lines.append(f"  {col['name']} ({col['dtype']}, {uniq}, {col['null_count']} nulls) e.g.: {samples}")
    return "\n".join(lines)
