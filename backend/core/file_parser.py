import pandas as pd
from pathlib import Path
from core.models import FileInfo


def parse_uploaded_file(file_path: str) -> tuple[dict[str, pd.DataFrame], FileInfo]:
    """Parse an Excel or CSV file into DataFrames and metadata."""
    path = Path(file_path)
    suffix = path.suffix.lower()

    if suffix in (".xlsx", ".xls"):
        return _parse_excel(file_path, path.name)
    elif suffix == ".csv":
        return _parse_csv(file_path, path.name)
    else:
        raise ValueError(f"Unsupported file type: {suffix}")


def _parse_excel(file_path: str, name: str) -> tuple[dict[str, pd.DataFrame], FileInfo]:
    all_sheets = pd.read_excel(file_path, sheet_name=None)

    # Filter out data dictionary sheets
    data_sheets = {}
    for sheet_name, df in all_sheets.items():
        lower = sheet_name.lower()
        if "dictionary" in lower or "metadata" in lower or "readme" in lower:
            continue
        if df.empty:
            continue
        data_sheets[sheet_name] = df

    info = FileInfo(
        name=name,
        sheets=list(data_sheets.keys()),
        row_counts={k: len(v) for k, v in data_sheets.items()},
        column_counts={k: len(v.columns) for k, v in data_sheets.items()},
    )
    return data_sheets, info


def _parse_csv(file_path: str, name: str) -> tuple[dict[str, pd.DataFrame], FileInfo]:
    df = pd.read_csv(file_path)
    sheet_name = Path(name).stem
    info = FileInfo(
        name=name,
        sheets=[sheet_name],
        row_counts={sheet_name: len(df)},
        column_counts={sheet_name: len(df.columns)},
    )
    return {sheet_name: df}, info


def get_schema_summary(tables: dict[str, pd.DataFrame], sample_rows: int = 5) -> dict:
    """Get schema info and sample data for LLM consumption."""
    summary = {}
    for table_name, df in tables.items():
        cols = []
        for col in df.columns:
            cols.append({
                "name": col,
                "dtype": str(df[col].dtype),
                "null_count": int(df[col].isna().sum()),
                "distinct_count": int(df[col].nunique()),
                "sample_values": [str(v) for v in df[col].dropna().head(3).tolist()],
            })
        summary[table_name] = {
            "row_count": len(df),
            "columns": cols,
            "sample_data": df.head(sample_rows).fillna("NULL").to_dict(orient="records"),
        }
    return summary
