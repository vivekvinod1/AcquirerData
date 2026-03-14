"""Violation Checker Agent - Runs all 13 violation rules against AMMF output."""

from core.job_store import Job
from core.models import ViolationReport, ViolationRecord
from rules.violation_rules import VIOLATION_RULES


def run_violation_checks(job: Job) -> ViolationReport:
    """Execute all 13 violation rules against the AMMF output table."""
    if job.ammf_dataframe is None:
        raise ValueError("AMMF output not yet generated")

    # Register the AMMF output as a DuckDB table
    job.db.conn.register("_ammf_temp", job.ammf_dataframe)
    job.db.conn.execute('CREATE OR REPLACE TABLE ammf_output AS SELECT * FROM "_ammf_temp"')
    job.db.conn.unregister("_ammf_temp")

    violations = []
    total_rows_affected = set()

    for rule in VIOLATION_RULES:
        try:
            result_df = rule["func"](job.db)
            count = len(result_df)

            if count > 0:
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
                    count=count,
                    sample_rows=sample,
                ))

                job.add_message(f"{rule['id']}: {count} violations found - {rule['name']}")
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
                sample_rows=[],
            ))

    total_violations = sum(v.count for v in violations if v.count > 0)

    return ViolationReport(
        violations=violations,
        total_violations=total_violations,
        total_rows_affected=len(total_rows_affected),
    )
