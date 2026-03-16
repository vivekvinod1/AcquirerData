import re
import pandas as pd
from pathlib import Path
from core.models import FileInfo, DataDictionaryEntry


def parse_uploaded_file(file_path: str) -> tuple[dict[str, pd.DataFrame], dict[str, pd.DataFrame], FileInfo]:
    """Parse an uploaded file. Returns (data_sheets, dictionary_sheets, file_info)."""
    path = Path(file_path)
    suffix = path.suffix.lower()

    if suffix in (".xlsx", ".xls"):
        return _parse_excel(file_path, path.name)
    elif suffix == ".csv":
        return _parse_csv(file_path, path.name)
    else:
        raise ValueError(f"Unsupported file type: {suffix}")


def _is_dictionary_sheet(sheet_name: str) -> bool:
    """Check if a sheet name looks like a data dictionary / metadata sheet."""
    lower = sheet_name.lower()
    return any(kw in lower for kw in ("dictionary", "metadata", "readme", "data dict", "field desc", "column desc"))


def _parse_excel(file_path: str, name: str) -> tuple[dict[str, pd.DataFrame], dict[str, pd.DataFrame], FileInfo]:
    all_sheets = pd.read_excel(file_path, sheet_name=None)

    data_sheets = {}
    dict_sheets = {}
    for sheet_name, df in all_sheets.items():
        if df.empty:
            continue
        if _is_dictionary_sheet(sheet_name):
            dict_sheets[sheet_name] = df
        else:
            data_sheets[sheet_name] = df

    info = FileInfo(
        name=name,
        sheets=list(data_sheets.keys()),
        row_counts={k: len(v) for k, v in data_sheets.items()},
        column_counts={k: len(v.columns) for k, v in data_sheets.items()},
    )
    return data_sheets, dict_sheets, info


def _parse_csv(file_path: str, name: str) -> tuple[dict[str, pd.DataFrame], dict[str, pd.DataFrame], FileInfo]:
    df = pd.read_csv(file_path)
    sheet_name = Path(name).stem
    info = FileInfo(
        name=name,
        sheets=[sheet_name],
        row_counts={sheet_name: len(df)},
        column_counts={sheet_name: len(df.columns)},
    )
    return {sheet_name: df}, {}, info


# ---------------------------------------------------------------------------
# Data Dictionary Extraction
# ---------------------------------------------------------------------------

# Keywords to identify the "column name" field in a dictionary sheet
_NAME_KEYWORDS = {"column", "field", "name", "attribute", "variable", "col_name", "column_name", "field_name"}
# Keywords to identify the "description" field
_DESC_KEYWORDS = {"description", "definition", "meaning", "desc", "details", "explanation", "comment", "notes"}
# Keywords to identify the "data type" field
_TYPE_KEYWORDS = {"type", "data_type", "dtype", "datatype", "format"}


def _normalize(s: str) -> str:
    """Lowercase and strip non-alphanumeric for fuzzy matching."""
    return re.sub(r"[^a-z0-9]", "", str(s).lower())


def _find_header_col(columns: list[str], keywords: set[str]) -> str | None:
    """Find a column whose normalized name matches one of the keywords."""
    for col in columns:
        norm = _normalize(col)
        if norm in keywords:
            return col
        # Also check if any keyword is a substring (e.g., "column_description" contains "description")
        for kw in keywords:
            if kw in norm:
                return col
    return None


def extract_data_dictionary(dict_sheets: dict[str, pd.DataFrame], source_table_hint: str | None = None) -> list[DataDictionaryEntry]:
    """
    Extract structured data dictionary entries from dictionary/metadata sheets.

    Looks for columns containing 'name'/'column'/'field' and 'description'/'definition'.
    Returns a flat list of DataDictionaryEntry objects.
    """
    entries: list[DataDictionaryEntry] = []

    for sheet_name, df in dict_sheets.items():
        if df.empty:
            continue

        cols = [str(c) for c in df.columns]

        # Try to find name and description columns
        name_col = _find_header_col(cols, _NAME_KEYWORDS)
        desc_col = _find_header_col(cols, _DESC_KEYWORDS)
        type_col = _find_header_col(cols, _TYPE_KEYWORDS)

        if not name_col or not desc_col:
            # Try scanning first few rows in case the actual header is not row 0
            # (some dictionaries have a title row before the real header)
            for start_row in range(1, min(5, len(df))):
                candidate_cols = [str(v) for v in df.iloc[start_row - 1].values if pd.notna(v)]
                name_col_c = _find_header_col(candidate_cols, _NAME_KEYWORDS)
                desc_col_c = _find_header_col(candidate_cols, _DESC_KEYWORDS)
                if name_col_c and desc_col_c:
                    # Re-read with this row as header
                    df2 = df.iloc[start_row:].copy()
                    df2.columns = [str(v) for v in df.iloc[start_row - 1].values]
                    cols = [str(c) for c in df2.columns]
                    name_col = _find_header_col(cols, _NAME_KEYWORDS)
                    desc_col = _find_header_col(cols, _DESC_KEYWORDS)
                    type_col = _find_header_col(cols, _TYPE_KEYWORDS)
                    df = df2
                    break

        if not name_col or not desc_col:
            continue  # Can't parse this sheet — skip gracefully

        # Detect if there's a "table" column to associate entries with source tables
        table_col = _find_header_col(cols, {"table", "sheet", "source_table", "table_name"})

        for _, row in df.iterrows():
            col_name = str(row.get(name_col, "")).strip()
            description = str(row.get(desc_col, "")).strip()

            if not col_name or col_name == "nan" or not description or description == "nan":
                continue

            source_table = None
            if table_col and pd.notna(row.get(table_col)):
                source_table = str(row[table_col]).strip()
            elif source_table_hint:
                source_table = source_table_hint

            data_type = None
            if type_col and pd.notna(row.get(type_col)):
                data_type = str(row[type_col]).strip()

            entries.append(DataDictionaryEntry(
                column_name=col_name,
                description=description,
                source_table=source_table,
                data_type=data_type,
            ))

    return entries


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
