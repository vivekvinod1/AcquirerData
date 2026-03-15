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


# ---------------------------------------------------------------------------
# DQ Rules metadata (read-only — these are hardcoded checks in the analyzer)
# ---------------------------------------------------------------------------

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
