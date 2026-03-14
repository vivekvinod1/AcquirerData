from pydantic import BaseModel
from enum import Enum
from datetime import datetime


class PipelineStep(str, Enum):
    UPLOADED = "uploaded"
    SCHEMA_MAPPING = "schema_mapping"
    COMPLETENESS = "completeness"
    RELATIONSHIPS = "relationships"
    QUALITY = "quality"
    QUERY_GENERATION = "query_generation"
    EXECUTING = "executing"
    VALIDATION = "validation"
    COMPLETE = "complete"
    ERROR = "error"


class FileInfo(BaseModel):
    name: str
    sheets: list[str]
    row_counts: dict[str, int]
    column_counts: dict[str, int]


class UploadResponse(BaseModel):
    job_id: str
    files: list[FileInfo]


class PipelineStatus(BaseModel):
    job_id: str
    step: PipelineStep
    progress_pct: int
    messages: list[str]
    started_at: str | None = None
    completed_at: str | None = None


class ColumnMapping(BaseModel):
    ammf_column: str
    source_table: str | None = None
    source_column: str | None = None
    confidence: float = 0.0
    reasoning: str = ""
    is_derived: bool = False
    derivation_logic: str = ""


class SchemaMapping(BaseModel):
    mappings: list[ColumnMapping]
    unmapped_required: list[str] = []
    unmapped_optional: list[str] = []


class ColumnQuality(BaseModel):
    column: str
    null_count: int
    null_pct: float
    distinct_count: int
    data_type: str
    sample_values: list[str]
    issues: list[str] = []


class TableQuality(BaseModel):
    table_name: str
    row_count: int
    columns: list[ColumnQuality]
    overall_score: float


class QualityReport(BaseModel):
    tables: list[TableQuality]


class ViolationRecord(BaseModel):
    rule_id: str
    rule_name: str
    description: str
    affected_columns: list[str]
    count: int
    sample_rows: list[dict]


class ViolationReport(BaseModel):
    violations: list[ViolationRecord]
    total_violations: int
    total_rows_affected: int


class CIBBINConfig(BaseModel):
    processor_name: str
    processor_bin_cib: int
    acquirer_name: str
    acquirer_bid: int
    acquirer_bin: int


class PipelineRunRequest(BaseModel):
    job_id: str
    cib_bin_config: CIBBINConfig | None = None
    selected_steps: list[str] | None = None  # None = all steps; e.g. ["schema_mapping","quality","validation"]


class AMMFPreview(BaseModel):
    rows: list[dict]
    total: int
    page: int
    page_size: int
