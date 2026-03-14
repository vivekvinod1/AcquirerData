"""Quality Analyzer Agent - Runs data quality checks per source table."""

from core.job_store import Job
from core.models import QualityReport, TableQuality, ColumnQuality
from rules.dq_rules import get_null_analysis_sql
import pandas as pd


def run_quality_analysis(job: Job) -> QualityReport:
    """Run DQ checks on all source tables."""
    table_reports = []

    for table_name, df in job.tables.items():
        columns = list(df.columns)
        col_qualities = []

        for col in columns:
            series = df[col]
            null_count = int(series.isna().sum())
            total = len(series)
            null_pct = round(null_count / total * 100, 2) if total > 0 else 0.0
            distinct_count = int(series.nunique())
            dtype = str(series.dtype)

            # Sample non-null values
            non_null = series.dropna()
            samples = [str(v) for v in non_null.head(5).tolist()]

            # Identify issues
            issues = []
            if null_pct > 50:
                issues.append(f"High null rate: {null_pct}%")
            if null_pct == 100:
                issues.append("Column is entirely null")
            if distinct_count == 1 and total > 10:
                issues.append("Only 1 distinct value (constant column)")
            if distinct_count == total and total > 100:
                issues.append("All values unique (potential PK)")

            # Check for suspicious patterns
            if dtype == "object" and non_null.shape[0] > 0:
                sample_str = non_null.astype(str)
                spaces_only = (sample_str.str.strip() == "").sum()
                if spaces_only > 0:
                    issues.append(f"{spaces_only} values are blank/whitespace-only")

            col_qualities.append(ColumnQuality(
                column=col,
                null_count=null_count,
                null_pct=null_pct,
                distinct_count=distinct_count,
                data_type=dtype,
                sample_values=samples,
                issues=issues,
            ))

        # Overall score: weighted by null rates and issues
        if col_qualities:
            avg_null_pct = sum(c.null_pct for c in col_qualities) / len(col_qualities)
            issue_count = sum(len(c.issues) for c in col_qualities)
            score = max(0, 100 - avg_null_pct - (issue_count * 5))
        else:
            score = 0

        table_reports.append(TableQuality(
            table_name=table_name,
            row_count=len(df),
            columns=col_qualities,
            overall_score=round(score, 1),
        ))

    return QualityReport(tables=table_reports)
