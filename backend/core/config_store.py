"""Persistent configuration store for editable violation rules and DQ settings."""

import json
import os
import re
from pathlib import Path

_DATA_DIR = Path(os.environ.get("AMMF_DATA_DIR", "/tmp/ammf_data"))
_RULES_FILE = _DATA_DIR / "custom_violation_rules.json"
_PROMPTS_FILE = _DATA_DIR / "custom_prompts.json"


def _load_custom_rules() -> dict[str, dict]:
    """Load custom/edited violation rules from disk."""
    try:
        if _RULES_FILE.exists():
            return json.loads(_RULES_FILE.read_text())
    except Exception:
        pass
    return {}


def _save_custom_rules(rules: dict[str, dict]):
    """Save custom/edited violation rules to disk."""
    try:
        _DATA_DIR.mkdir(parents=True, exist_ok=True)
        _RULES_FILE.write_text(json.dumps(rules, indent=2))
    except Exception:
        pass


# Module-level cache
_custom_rules: dict[str, dict] = _load_custom_rules()


def get_custom_rules() -> dict[str, dict]:
    """Return all custom/edited rules."""
    return _custom_rules


def upsert_custom_rule(rule_id: str, rule_data: dict):
    """Add or update a custom rule."""
    _custom_rules[rule_id] = rule_data
    _save_custom_rules(_custom_rules)


def delete_custom_rule(rule_id: str) -> bool:
    """Delete a custom rule. Returns True if found."""
    if rule_id in _custom_rules:
        del _custom_rules[rule_id]
        _save_custom_rules(_custom_rules)
        return True
    return False


def reset_custom_rules():
    """Remove all custom rules, restoring factory defaults."""
    _custom_rules.clear()
    _save_custom_rules(_custom_rules)


def get_effective_rules() -> list[dict]:
    """Return the merged list of all violation rules (built-in + custom),
    respecting config overrides (name, description, columns, sql, enabled).

    Each returned dict has: id, name, description, columns, sql, func, enabled.
    - Built-in rules may have overridden metadata or SQL from config.
    - Custom rules (V14+) get a func that executes their SQL directly.
    - Disabled rules are excluded.
    """
    from rules.violation_rules import VIOLATION_RULES, VIOLATION_SQL

    custom = get_custom_rules()
    effective = []

    # 1. Built-in rules (may have custom overrides)
    for rule in VIOLATION_RULES:
        rid = rule["id"]
        override = custom.get(rid, {})

        # Skip disabled rules
        if not override.get("enabled", True):
            continue

        # If SQL was overridden in config, create a new func that runs that SQL
        custom_sql = override.get("sql")
        if custom_sql:
            def _make_sql_func(sql_str):
                def _func(db):
                    return db.execute(sql_str)
                return _func
            func = _make_sql_func(custom_sql)
        else:
            func = rule["func"]

        effective.append({
            "id": rid,
            "name": override.get("name", rule["name"]),
            "description": override.get("description", rule["description"]),
            "columns": override.get("columns", rule["columns"]),
            "sql": custom_sql or VIOLATION_SQL.get(rid, ""),
            "func": func,
        })

    # 2. Purely custom rules (V14+) — not in VIOLATION_RULES
    builtin_ids = {r["id"] for r in VIOLATION_RULES}
    for rid, data in custom.items():
        if rid in builtin_ids:
            continue
        if not data.get("enabled", True):
            continue
        sql = data.get("sql", "")
        if not sql:
            continue  # Can't execute without SQL

        def _make_custom_func(sql_str):
            def _func(db):
                return db.execute(sql_str)
            return _func

        effective.append({
            "id": rid,
            "name": data.get("name", rid),
            "description": data.get("description", ""),
            "columns": data.get("columns", []),
            "sql": sql,
            "func": _make_custom_func(sql),
        })

    # Sort by ID (V1, V2, ... V13, V14, ...)
    effective.sort(key=lambda r: (
        int(r["id"][1:]) if r["id"][1:].isdigit() else 999,
        r["id"]
    ))
    return effective


# ---------------------------------------------------------------------------
# Custom LLM Prompts
# ---------------------------------------------------------------------------

# Default prompt keys — these match the keys used across agents
PROMPT_KEYS = {
    "schema_mapping": "Schema Mapping",
    "relationship_discovery": "Relationship Discovery",
    "sql_generation": "SQL Generation",
    "chat": "Chat Assistant",
}


def _load_custom_prompts() -> dict[str, str]:
    """Load custom prompts from disk."""
    try:
        if _PROMPTS_FILE.exists():
            return json.loads(_PROMPTS_FILE.read_text())
    except Exception:
        pass
    return {}


def _save_custom_prompts(prompts: dict[str, str]):
    """Save custom prompts to disk."""
    try:
        _DATA_DIR.mkdir(parents=True, exist_ok=True)
        _PROMPTS_FILE.write_text(json.dumps(prompts, indent=2))
    except Exception:
        pass


_custom_prompts: dict[str, str] = _load_custom_prompts()


def get_prompt(key: str, default=None):
    """Get a custom prompt by key, or return default if not customized."""
    return _custom_prompts.get(key) or default


def set_prompt(key: str, value: str):
    """Save a custom prompt override."""
    _custom_prompts[key] = value
    _save_custom_prompts(_custom_prompts)


def get_all_prompts() -> dict[str, str]:
    """Return all custom prompt overrides."""
    return dict(_custom_prompts)


def delete_prompt(key: str) -> bool:
    """Delete a custom prompt (restores factory default). Returns True if found."""
    if key in _custom_prompts:
        del _custom_prompts[key]
        _save_custom_prompts(_custom_prompts)
        return True
    return False


def reset_prompts():
    """Remove all custom prompts, restoring factory defaults."""
    _custom_prompts.clear()
    _save_custom_prompts(_custom_prompts)


# ---------------------------------------------------------------------------
# DQ Rules metadata (read-only — these are hardcoded checks in the analyzer)
# ---------------------------------------------------------------------------

DQ_RULES_METADATA = [
    {
        "id": "DQ1",
        "name": "High Null Rate",
        "description": "Flags columns where more than 50% of values are null",
        "threshold": "50%",
        "severity": "warning",
        "editable": False,
    },
    {
        "id": "DQ2",
        "name": "Entirely Null Column",
        "description": "Flags columns where 100% of values are null — column provides no data",
        "threshold": "100%",
        "severity": "critical",
        "editable": False,
    },
    {
        "id": "DQ3",
        "name": "Constant Column",
        "description": "Flags columns with only 1 distinct value across >10 rows (provides no differentiation)",
        "threshold": "1 distinct value",
        "severity": "info",
        "editable": False,
    },
    {
        "id": "DQ4",
        "name": "All Values Unique",
        "description": "Flags columns where every value is unique across >100 rows (potential primary key)",
        "threshold": "100% unique",
        "severity": "info",
        "editable": False,
    },
    {
        "id": "DQ5",
        "name": "Blank/Whitespace Values",
        "description": "Detects string values that are empty or contain only whitespace characters",
        "threshold": "Any blank values",
        "severity": "warning",
        "editable": False,
    },
]


# ---------------------------------------------------------------------------
# Mapping Templates — saved schema mappings keyed by input data fingerprint
# ---------------------------------------------------------------------------

_TEMPLATES_FILE = _DATA_DIR / "mapping_templates.json"


def compute_schema_fingerprint(tables: dict) -> str:
    """Compute a SHA-256 fingerprint from table names + column names.

    Any change in table names or column names/order produces a different hash.
    This is a strict match — same tables + same columns = same fingerprint.
    """
    import hashlib
    parts = []
    for table_name in sorted(tables.keys()):
        df = tables[table_name]
        cols = sorted(str(c) for c in df.columns)
        parts.append(f"{table_name}:{','.join(cols)}")
    canonical = "|".join(parts)
    return hashlib.sha256(canonical.encode()).hexdigest()


def _load_mapping_templates() -> dict[str, dict]:
    """Load saved mapping templates from disk."""
    try:
        if _TEMPLATES_FILE.exists():
            return json.loads(_TEMPLATES_FILE.read_text())
    except Exception:
        pass
    return {}


def _save_mapping_templates(templates: dict[str, dict]):
    """Save mapping templates to disk."""
    try:
        _DATA_DIR.mkdir(parents=True, exist_ok=True)
        _TEMPLATES_FILE.write_text(json.dumps(templates, indent=2))
    except Exception:
        pass


_mapping_templates: dict[str, dict] = _load_mapping_templates()


def get_mapping_template(fingerprint: str) -> dict | None:
    """Get a saved mapping template by fingerprint."""
    return _mapping_templates.get(fingerprint)


def save_mapping_template(fingerprint: str, data: dict):
    """Save a mapping template."""
    _mapping_templates[fingerprint] = data
    _save_mapping_templates(_mapping_templates)


def delete_mapping_template(fingerprint: str) -> bool:
    """Delete a mapping template. Returns True if found."""
    if fingerprint in _mapping_templates:
        del _mapping_templates[fingerprint]
        _save_mapping_templates(_mapping_templates)
        return True
    return False


def get_all_mapping_templates() -> dict[str, dict]:
    """Return all saved mapping templates."""
    return dict(_mapping_templates)


def reset_mapping_templates():
    """Remove all saved mapping templates."""
    _mapping_templates.clear()
    _save_mapping_templates(_mapping_templates)
