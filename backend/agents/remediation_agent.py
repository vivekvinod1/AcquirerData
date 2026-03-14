"""Remediation Agent - Generates fix proposals for AMMF violations.

For each violation rule, determines the best strategy (auto_fix, web_research,
or manual_review) and generates concrete fix proposals with old→new values.
"""

import pandas as pd
from core.job_store import Job
from core.llm_client import llm_client
from core.models import (
    RemediationPlan, RemediationFix, RemediationStrategy,
)

# Map each violation to its default remediation strategy
RULE_STRATEGIES: dict[str, RemediationStrategy] = {
    "V1": RemediationStrategy.AUTO_FIX,       # Remove acquirer name from merchant fields
    "V2": RemediationStrategy.WEB_RESEARCH,    # Need real address data
    "V3": RemediationStrategy.MANUAL_REVIEW,   # Ambiguous — which address is correct?
    "V4": RemediationStrategy.WEB_RESEARCH,    # Need real address from web
    "V5": RemediationStrategy.AUTO_FIX,        # Derive BASEIIName from rules
    "V6": RemediationStrategy.MANUAL_REVIEW,   # CIB/BID/BIN need acquirer input
    "V7": RemediationStrategy.MANUAL_REVIEW,   # Invalid CAID needs acquirer input
    "V8": RemediationStrategy.MANUAL_REVIEW,   # Ambiguous MID assignment
    "V9": RemediationStrategy.WEB_RESEARCH,    # Look up real tax ID
    "V10": RemediationStrategy.WEB_RESEARCH,   # Verify correct merchant name
    "V11": RemediationStrategy.MANUAL_REVIEW,  # MID/CAID relationship needs acquirer
    "V12": RemediationStrategy.AUTO_FIX,       # Clear copied BASEIIName
    "V13": RemediationStrategy.MANUAL_REVIEW,  # Tax ID sharing needs acquirer input
}


def generate_remediation_plan(job: Job, rule_id: str) -> RemediationPlan:
    """Generate a remediation plan for a specific violation rule."""
    if not job.violation_report:
        raise ValueError("No violation report available")
    if job.ammf_dataframe is None:
        raise ValueError("No AMMF data available")

    # Find the violation record
    violation = None
    for v in job.violation_report.violations:
        if v.rule_id == rule_id:
            violation = v
            break
    if not violation or violation.count <= 0:
        raise ValueError(f"No violations found for {rule_id}")

    strategy = RULE_STRATEGIES.get(rule_id, RemediationStrategy.MANUAL_REVIEW)

    # Run the violation SQL to get all affected rows with their indices
    from rules.violation_rules import VIOLATION_RULES
    rule_def = next((r for r in VIOLATION_RULES if r["id"] == rule_id), None)
    if not rule_def:
        raise ValueError(f"Unknown rule: {rule_id}")

    # Re-register AMMF data and run violation query
    job.db.conn.register("_ammf_temp", job.ammf_dataframe)
    job.db.conn.execute('CREATE OR REPLACE TABLE ammf_output AS SELECT * FROM "_ammf_temp"')
    job.db.conn.unregister("_ammf_temp")

    affected_df = rule_def["func"](job.db)

    # Route to specific handler
    handler = _RULE_HANDLERS.get(rule_id, _generate_llm_plan)
    fixes = handler(job, rule_id, affected_df, violation.affected_columns)

    plan = RemediationPlan(
        rule_id=rule_id,
        rule_name=violation.rule_name,
        total_affected=violation.count,
        fixes=fixes,
        strategy=strategy,
        summary=_generate_summary(rule_id, fixes, violation.count),
    )

    # Store on the job
    job.remediation_plans[rule_id] = plan
    return plan


def _generate_summary(rule_id: str, fixes: list[RemediationFix], total: int) -> str:
    auto = sum(1 for f in fixes if f.strategy == RemediationStrategy.AUTO_FIX)
    web = sum(1 for f in fixes if f.strategy == RemediationStrategy.WEB_RESEARCH)
    manual = sum(1 for f in fixes if f.strategy == RemediationStrategy.MANUAL_REVIEW)
    parts = []
    if auto:
        parts.append(f"{auto} auto-fixable")
    if web:
        parts.append(f"{web} need web research")
    if manual:
        parts.append(f"{manual} need manual review")
    return f"{total} violations: " + ", ".join(parts) if parts else f"{total} violations found"


# ---------------------------------------------------------------------------
# Rule-specific handlers
# ---------------------------------------------------------------------------

def _handle_v1(job: Job, rule_id: str, df: pd.DataFrame, columns: list[str]) -> list[RemediationFix]:
    """V1: Acquirer name in merchant fields — replace with empty or correct value."""
    fixes = []
    ammf = job.ammf_dataframe
    acq_name_vals = df["AcquirerName"].dropna().unique()

    for idx, row in df.iterrows():
        # Find the original row index in the AMMF dataframe
        ammf_idx = _find_ammf_index(ammf, row)
        if ammf_idx is None:
            continue

        for col in ["DBAName", "LegalName", "BASEIIName"]:
            val = str(row.get(col, "") or "").strip()
            acq = str(row.get("AcquirerName", "") or "").strip()
            if val and acq and val.lower() == acq.lower():
                fixes.append(RemediationFix(
                    row_indices=[ammf_idx],
                    column=col,
                    old_value=val,
                    new_value="",
                    reasoning=f"'{val}' matches AcquirerName — should contain actual merchant name, not acquirer name",
                    confidence=0.95,
                    strategy=RemediationStrategy.WEB_RESEARCH,
                    needs_confirmation=True,
                ))
    return _cap_fixes(fixes)


def _handle_v2(job: Job, rule_id: str, df: pd.DataFrame, columns: list[str]) -> list[RemediationFix]:
    """V2: Street = City — need to look up real address."""
    fixes = []
    ammf = job.ammf_dataframe
    for idx, row in df.iterrows():
        ammf_idx = _find_ammf_index(ammf, row)
        if ammf_idx is None:
            continue
        merchant = str(row.get("DBAName", "") or "")
        fixes.append(RemediationFix(
            row_indices=[ammf_idx],
            column="Street",
            old_value=str(row.get("Street", "")),
            new_value=None,
            reasoning=f"Street '{row.get('Street', '')}' is identical to City '{row.get('City', '')}' for merchant '{merchant}'. Web research needed for real address.",
            confidence=0.0,
            strategy=RemediationStrategy.WEB_RESEARCH,
            needs_confirmation=True,
        ))
    return _cap_fixes(fixes)


def _handle_v4(job: Job, rule_id: str, df: pd.DataFrame, columns: list[str]) -> list[RemediationFix]:
    """V4: Invalid addresses — need web research for real address."""
    fixes = []
    ammf = job.ammf_dataframe
    for idx, row in df.iterrows():
        ammf_idx = _find_ammf_index(ammf, row)
        if ammf_idx is None:
            continue
        fixes.append(RemediationFix(
            row_indices=[ammf_idx],
            column="Street",
            old_value=str(row.get("Street", "")),
            new_value=None,
            reasoning=f"Address appears invalid for merchant '{row.get('DBAName', '')}'. Web research needed.",
            confidence=0.0,
            strategy=RemediationStrategy.WEB_RESEARCH,
            needs_confirmation=True,
        ))
    return _cap_fixes(fixes)


def _handle_v5(job: Job, rule_id: str, df: pd.DataFrame, columns: list[str]) -> list[RemediationFix]:
    """V5: Invalid BASEIIName — derive from AggregatorName + DBA."""
    fixes = []
    ammf = job.ammf_dataframe
    for idx, row in df.iterrows():
        ammf_idx = _find_ammf_index(ammf, row)
        if ammf_idx is None:
            continue
        agg = str(row.get("AggregatorName", "") or "").strip()
        dba = str(row.get("DBAName", "") or "").strip()
        if agg:
            new_val = f"{agg} * {dba}" if dba else agg
            fixes.append(RemediationFix(
                row_indices=[ammf_idx],
                column="BASEIIName",
                old_value=str(row.get("BASEIIName", "") or ""),
                new_value=new_val,
                reasoning=f"BASEIIName should be derived from AggregatorName + DBAName for PF records",
                confidence=0.9,
                strategy=RemediationStrategy.AUTO_FIX,
                needs_confirmation=False,
            ))
    return _cap_fixes(fixes)


def _handle_v9(job: Job, rule_id: str, df: pd.DataFrame, columns: list[str]) -> list[RemediationFix]:
    """V9: Invalid Tax ID — flag for web research."""
    fixes = []
    ammf = job.ammf_dataframe
    for idx, row in df.iterrows():
        ammf_idx = _find_ammf_index(ammf, row)
        if ammf_idx is None:
            continue
        fixes.append(RemediationFix(
            row_indices=[ammf_idx],
            column="BusinessRegistrationID",
            old_value=str(row.get("BusinessRegistrationID", "")),
            new_value=None,
            reasoning=f"Tax ID '{row.get('BusinessRegistrationID', '')}' appears invalid for '{row.get('DBAName', '')}'. Web research may find correct value.",
            confidence=0.0,
            strategy=RemediationStrategy.WEB_RESEARCH,
            needs_confirmation=True,
        ))
    return _cap_fixes(fixes)


def _handle_v12(job: Job, rule_id: str, df: pd.DataFrame, columns: list[str]) -> list[RemediationFix]:
    """V12: BASEIIName copied to DBA/Legal — clear the copied field."""
    fixes = []
    ammf = job.ammf_dataframe
    for idx, row in df.iterrows():
        ammf_idx = _find_ammf_index(ammf, row)
        if ammf_idx is None:
            continue
        baseii = str(row.get("BASEIIName", "") or "").strip().lower()
        dba = str(row.get("DBAName", "") or "").strip().lower()
        legal = str(row.get("LegalName", "") or "").strip().lower()

        if baseii == dba:
            fixes.append(RemediationFix(
                row_indices=[ammf_idx],
                column="DBAName",
                old_value=str(row.get("DBAName", "")),
                new_value=None,
                reasoning="DBAName is identical to BASEIIName — needs actual merchant DBA name",
                confidence=0.0,
                strategy=RemediationStrategy.WEB_RESEARCH,
                needs_confirmation=True,
            ))
        if baseii == legal:
            fixes.append(RemediationFix(
                row_indices=[ammf_idx],
                column="LegalName",
                old_value=str(row.get("LegalName", "")),
                new_value=None,
                reasoning="LegalName is identical to BASEIIName — needs actual merchant legal name",
                confidence=0.0,
                strategy=RemediationStrategy.WEB_RESEARCH,
                needs_confirmation=True,
            ))
    return _cap_fixes(fixes)


def _generate_llm_plan(job: Job, rule_id: str, df: pd.DataFrame, columns: list[str]) -> list[RemediationFix]:
    """Generic LLM-based remediation plan for rules without specific handlers."""
    strategy = RULE_STRATEGIES.get(rule_id, RemediationStrategy.MANUAL_REVIEW)
    ammf = job.ammf_dataframe

    # For large violation sets, just create per-row fix stubs
    fixes = []
    for idx, row in df.head(200).iterrows():
        ammf_idx = _find_ammf_index(ammf, row)
        if ammf_idx is None:
            continue
        primary_col = columns[0] if columns else "Unknown"
        fixes.append(RemediationFix(
            row_indices=[ammf_idx],
            column=primary_col,
            old_value=str(row.get(primary_col, "")),
            new_value=None,
            reasoning=f"Flagged by {rule_id} — requires {'web research' if strategy == RemediationStrategy.WEB_RESEARCH else 'manual review'}",
            confidence=0.0,
            strategy=strategy,
            needs_confirmation=True,
        ))
    return _cap_fixes(fixes)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _find_ammf_index(ammf: pd.DataFrame, row: pd.Series) -> int | None:
    """Find the DataFrame index for a violation row in the AMMF output."""
    # Match on CAID + AcquirerMerchantID as composite key
    caid = row.get("CAID")
    mid = row.get("AcquirerMerchantID")
    if caid is None and mid is None:
        return None

    mask = pd.Series([True] * len(ammf), index=ammf.index)
    if caid is not None:
        mask &= ammf["CAID"].astype(str) == str(caid)
    if mid is not None:
        mask &= ammf["AcquirerMerchantID"].astype(str) == str(mid)

    matches = ammf.index[mask]
    return int(matches[0]) if len(matches) > 0 else None


def _cap_fixes(fixes: list[RemediationFix], limit: int = 500) -> list[RemediationFix]:
    """Cap the number of fixes to avoid overwhelming the UI."""
    return fixes[:limit]


# Handler registry
_RULE_HANDLERS = {
    "V1": _handle_v1,
    "V2": _handle_v2,
    "V4": _handle_v4,
    "V5": _handle_v5,
    "V9": _handle_v9,
    "V12": _handle_v12,
}


def apply_fixes(job: Job, rule_id: str, fix_indices: list[int]) -> dict:
    """Apply selected fixes to the AMMF DataFrame and re-run the violation check.

    Returns {rows_modified, new_violation_count, previous_violation_count, delta}.
    """
    plan = job.remediation_plans.get(rule_id)
    if not plan:
        raise ValueError(f"No remediation plan for {rule_id}")

    ammf = job.ammf_dataframe
    if ammf is None:
        raise ValueError("No AMMF data")

    # Find previous count
    prev_count = 0
    if job.violation_report:
        for v in job.violation_report.violations:
            if v.rule_id == rule_id:
                prev_count = v.count
                break

    rows_modified = 0
    for idx in fix_indices:
        if idx < 0 or idx >= len(plan.fixes):
            continue
        fix = plan.fixes[idx]
        if fix.new_value is None:
            continue  # Can't apply — needs user input

        for row_idx in fix.row_indices:
            if 0 <= row_idx < len(ammf):
                ammf.at[row_idx, fix.column] = fix.new_value
                rows_modified += 1

    # Re-run just this rule to get new count
    from rules.violation_rules import VIOLATION_RULES
    rule_def = next((r for r in VIOLATION_RULES if r["id"] == rule_id), None)

    job.db.conn.register("_ammf_temp", ammf)
    job.db.conn.execute('CREATE OR REPLACE TABLE ammf_output AS SELECT * FROM "_ammf_temp"')
    job.db.conn.unregister("_ammf_temp")

    new_count = 0
    if rule_def:
        try:
            result = rule_def["func"](job.db)
            new_count = len(result)
        except Exception:
            new_count = prev_count

    # Update violation report
    if job.violation_report:
        for v in job.violation_report.violations:
            if v.rule_id == rule_id:
                v.count = new_count
                break
        job.violation_report.total_violations = sum(
            v.count for v in job.violation_report.violations if v.count > 0
        )

    return {
        "rows_modified": rows_modified,
        "new_violation_count": new_count,
        "previous_violation_count": prev_count,
        "delta": prev_count - new_count,
    }
