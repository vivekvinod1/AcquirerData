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
