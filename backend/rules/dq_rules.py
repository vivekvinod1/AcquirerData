"""Data quality check rules executed as SQL against DuckDB tables."""


def get_null_analysis_sql(table_name: str, columns: list[str]) -> str:
    """Generate SQL to compute null counts and percentages per column."""
    parts = []
    for col in columns:
        parts.append(
            f"SUM(CASE WHEN \"{col}\" IS NULL THEN 1 ELSE 0 END) AS \"{col}_null_count\""
        )
        parts.append(
            f"ROUND(100.0 * SUM(CASE WHEN \"{col}\" IS NULL THEN 1 ELSE 0 END) / COUNT(*), 2) AS \"{col}_null_pct\""
        )
        parts.append(f"COUNT(DISTINCT \"{col}\") AS \"{col}_distinct\"")
    select_clause = ",\n  ".join(parts)
    return f'SELECT COUNT(*) AS total_rows,\n  {select_clause}\nFROM "{table_name}"'


def get_type_check_sql(table_name: str, column: str, expected_type: str) -> str:
    """Generate SQL to find values that don't match expected type."""
    if expected_type == "integer":
        return (
            f'SELECT "{column}", typeof("{column}") AS actual_type '
            f'FROM "{table_name}" '
            f'WHERE "{column}" IS NOT NULL '
            f'AND TRY_CAST("{column}" AS INTEGER) IS NULL '
            f'LIMIT 10'
        )
    elif expected_type == "date":
        return (
            f'SELECT "{column}", typeof("{column}") AS actual_type '
            f'FROM "{table_name}" '
            f'WHERE "{column}" IS NOT NULL '
            f'AND TRY_CAST("{column}" AS DATE) IS NULL '
            f'LIMIT 10'
        )
    return ""


def get_uniqueness_check_sql(table_name: str, columns: list[str]) -> str:
    """Check if a set of columns forms a unique key."""
    col_list = ", ".join(f'"{c}"' for c in columns)
    return (
        f'SELECT {col_list}, COUNT(*) AS dup_count '
        f'FROM "{table_name}" '
        f'GROUP BY {col_list} '
        f'HAVING COUNT(*) > 1 '
        f'LIMIT 10'
    )
