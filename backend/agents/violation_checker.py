"""Violation Checker Agent - Runs all 13 violation rules against AMMF output.

Count semantics:
  - ``count`` = number of *rows* returned by the rule SQL (affected rows)
  - ``group_count`` = number of distinct violation *groups* for group-based
    rules (V3, V8, V10, V11, V13).  For row-level rules this equals count.

The full violation DataFrames are stored on the job so the download endpoint
can export *all* rows, not just the 10-row sample.
"""

import pandas as pd
from core.job_store import Job
from core.models import ViolationReport, ViolationRecord
from rules.violation_rules import VIOLATION_RULES

# For group-based rules, which column(s) define the "group".
# If a rule is missing here, group_count == row count.
_GROUP_KEYS: dict[str, list[str]] = {
    "V3":  ["CAID", "AcquirerMerchantID", "DBAName"],  # same MID+CAID+DBA group
    "V8":  ["Street", "City", "PostalCode"],             # same address group
    "V10": ["CAID", "AcquirerMerchantID"],               # same MID+CAID group
    "V11": ["CAID"],                                      # same CAID group
    "V13": ["AggregatorID"],                              # same aggregator group
}


def _count_groups(rule_id: str, result_df: pd.DataFrame) -> int:
    """Return the number of distinct violation groups for a group-based rule."""
    keys = _GROUP_KEYS.get(rule_id)
    if not keys:
        return len(result_df)
    # Only use keys that actually exist in the DataFrame
    usable = [k for k in keys if k in result_df.columns]
    if not usable:
        return len(result_df)
    return int(result_df[usable].drop_duplicates().shape[0])


def run_violation_checks(job: Job, selected_violations: list[str] | None = None) -> ViolationReport:
    """Execute violation rules against the AMMF output table.

    Args:
        job: The pipeline job.
        selected_violations: If provided, only run these rule IDs (e.g. ["V1","V2"]).
                             None means run all 13 rules.
    """
    if job.ammf_dataframe is None:
        raise ValueError("AMMF output not yet generated")

    # Register the AMMF output as a DuckDB table
    job.db.conn.register("_ammf_temp", job.ammf_dataframe)
    job.db.conn.execute('CREATE OR REPLACE TABLE ammf_output AS SELECT * FROM "_ammf_temp"')
    job.db.conn.unregister("_ammf_temp")

    # Filter rules if selection provided
    rules_to_run = VIOLATION_RULES
    if selected_violations is not None:
        selected_set = set(selected_violations)
        rules_to_run = [r for r in VIOLATION_RULES if r["id"] in selected_set]
        skipped = [r["id"] for r in VIOLATION_RULES if r["id"] not in selected_set]
        job.add_message(f"Running {len(rules_to_run)} of {len(VIOLATION_RULES)} violation rules")
        if skipped:
            job.add_message(f"Skipped rules: {', '.join(skipped)}")

    violations = []
    total_rows_affected = set()
    # Store full violation DataFrames for download
    job.violation_dataframes = {}

    for rule in rules_to_run:
        try:
            result_df = rule["func"](job.db)
            row_count = len(result_df)

            if row_count > 0:
                group_count = _count_groups(rule["id"], result_df)

                # Store full DataFrame for download (not just sample)
                job.violation_dataframes[rule["id"]] = result_df

                # Get sample rows (max 10)
                sample = result_df.head(10).fillna("").to_dict(orient="records")

                # Track unique affected rows by CAID + MID
                if "CAID" in result_df.columns and "AcquirerMerchantID" in result_df.columns:
                    for _, row in result_df.iterrows():
                        total_rows_affected.add(
                            f"{row.get('CAID', '')}|{row.get('AcquirerMerchantID', '')}"
                        )

                violations.append(ViolationRecord(
                    rule_id=rule["id"],
                    rule_name=rule["name"],
                    description=rule["description"],
                    affected_columns=rule["columns"],
                    count=row_count,
                    group_count=group_count,
                    sample_rows=sample,
                ))

                # Show both counts in log for group-based rules
                if rule["id"] in _GROUP_KEYS:
                    job.add_message(
                        f"{rule['id']}: {group_count} groups ({row_count} rows) - {rule['name']}"
                    )
                else:
                    job.add_message(f"{rule['id']}: {row_count} violations found - {rule['name']}")
            else:
                job.add_message(f"{rule['id']}: No violations - {rule['name']}")

        except Exception as e:
            job.add_message(f"{rule['id']}: ERROR - {e}")
            violations.append(ViolationRecord(
                rule_id=rule["id"],
                rule_name=rule["name"],
                description=f"Error running check: {e}",
                affected_columns=rule["columns"],
                count=-1,
                group_count=0,
                sample_rows=[],
            ))

    total_violations = sum(v.count for v in violations if v.count > 0)

    return ViolationReport(
        violations=violations,
        total_violations=total_violations,
        total_rows_affected=len(total_rows_affected),
    )
