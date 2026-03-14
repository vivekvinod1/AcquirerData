"""Completeness Checker Agent - Validates all required AMMF fields have source mappings."""

from core.models import SchemaMapping
from rules.ammf_spec import AMMF_COLUMNS


def run_completeness_check(schema_mapping: SchemaMapping) -> dict:
    """Check that all required AMMF fields are mapped or derivable."""
    mapped_cols = {
        m.ammf_column
        for m in schema_mapping.mappings
        if m.source_column or m.is_derived
    }

    missing_required = []
    missing_submerchant = []
    missing_optional = []
    coverage = {}

    for col in AMMF_COLUMNS:
        name = col["name"]
        is_mapped = name in mapped_cols

        if col["required"] is True and not is_mapped:
            missing_required.append(name)
        elif col["required"] == "submerchant" and not is_mapped:
            missing_submerchant.append(name)
        elif col["required"] is False and not is_mapped:
            missing_optional.append(name)

        coverage[name] = {
            "mapped": is_mapped,
            "required": col["required"],
        }

    total = len(AMMF_COLUMNS)
    mapped_count = len(mapped_cols)

    return {
        "total_columns": total,
        "mapped_columns": mapped_count,
        "coverage_pct": round(mapped_count / total * 100, 1),
        "missing_required": missing_required,
        "missing_submerchant_required": missing_submerchant,
        "missing_optional": missing_optional,
        "coverage": coverage,
    }
