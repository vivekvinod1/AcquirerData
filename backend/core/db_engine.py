import duckdb
import pandas as pd


class DuckDBEngine:
    """Manages an in-memory DuckDB connection for a single pipeline job."""

    def __init__(self):
        self.conn = duckdb.connect(":memory:")

    def load_dataframe(self, table_name: str, df: pd.DataFrame):
        """Register a pandas DataFrame as a DuckDB table."""
        safe_name = table_name.replace(" ", "_").replace("-", "_")
        self.conn.register(f"_temp_{safe_name}", df)
        self.conn.execute(
            f'CREATE TABLE "{safe_name}" AS SELECT * FROM "_temp_{safe_name}"'
        )
        self.conn.unregister(f"_temp_{safe_name}")

    def load_tables(self, tables: dict[str, pd.DataFrame]):
        """Load multiple DataFrames as DuckDB tables."""
        for name, df in tables.items():
            self.load_dataframe(name, df)

    def execute(self, sql: str) -> pd.DataFrame:
        """Execute SQL and return result as DataFrame."""
        return self.conn.execute(sql).fetchdf()

    def execute_raw(self, sql: str) -> list[tuple]:
        """Execute SQL and return raw tuples."""
        return self.conn.execute(sql).fetchall()

    def get_table_names(self) -> list[str]:
        """List all loaded tables."""
        result = self.conn.execute("SHOW TABLES").fetchall()
        return [row[0] for row in result]

    def get_table_schema(self, table_name: str) -> list[dict]:
        """Get column names and types for a table."""
        result = self.conn.execute(f'DESCRIBE "{table_name}"').fetchall()
        return [{"name": row[0], "type": row[1]} for row in result]

    def get_row_count(self, table_name: str) -> int:
        result = self.conn.execute(f'SELECT COUNT(*) FROM "{table_name}"').fetchone()
        return result[0]

    def close(self):
        self.conn.close()
