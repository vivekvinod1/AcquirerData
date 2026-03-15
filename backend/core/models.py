from pydantic import BaseModel
from enum import Enum
from datetime import datetime


class PipelineStep(str, Enum):
    UPLOADED = "uploaded"
    INGESTION = "ingestion"                    # Phase 1: DQ on raw data + schema mapping
    AWAITING_APPROVAL = "awaiting_approval"    # Paused for human review
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
    count: int             # total rows returned by the rule SQL
    group_count: int = 0   # distinct violation groups (for group-based rules)
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


class JobSummary(BaseModel):
    job_id: str
    step: PipelineStep
    progress_pct: int
    started_at: str | None = None
    completed_at: str | None = None
    created_at: str = ""
    file_names: list[str] = []
    total_rows: int = 0
    violation_count: int | None = None


class PipelineRunRequest(BaseModel):
    job_id: str
    cib_bin_config: CIBBINConfig | None = None
    selected_steps: list[str] | None = None  # None = all steps; e.g. ["schema_mapping","quality","validation"]
    selected_violations: list[str] | None = None  # None = defaults; e.g. ["V1","V2",...]


class PipelineContinueRequest(BaseModel):
    """Resume pipeline after human approval of ingestion results."""
    job_id: str
    selected_violations: list[str] | None = None  # Which violation rules to run


class ChatRequest(BaseModel):
    """Send a chat message about the current job's data."""
    job_id: str
    message: str


class AMMFPreview(BaseModel):
    rows: list[dict]
    total: int
    page: int
    page_size: int


# ---------------------------------------------------------------------------
# Remediation Engine models
# ---------------------------------------------------------------------------

class RemediationStrategy(str, Enum):
    AUTO_FIX = "auto_fix"
    WEB_RESEARCH = "web_research"
    MANUAL_REVIEW = "manual_review"


class RemediationFix(BaseModel):
    """A single proposed fix for one or more rows."""
    row_indices: list[int]  # indices into the AMMF DataFrame
    column: str
    old_value: str | None = None
    new_value: str | None = None
    reasoning: str = ""
    confidence: float = 0.0
    strategy: RemediationStrategy = RemediationStrategy.AUTO_FIX
    needs_confirmation: bool = True


class RemediationPlan(BaseModel):
    """Plan generated for a single violation rule."""
    rule_id: str
    rule_name: str
    total_affected: int
    fixes: list[RemediationFix]
    summary: str = ""
    strategy: RemediationStrategy = RemediationStrategy.AUTO_FIX


class WebResearchResult(BaseModel):
    """Result from web research for a merchant."""
    merchant_name: str
    query: str
    findings: list[dict] = []  # [{source, title, snippet, relevance}]
    suggested_fixes: list[dict] = []  # [{column, value, reasoning}]
    raw_analysis: str = ""
    search_queries_used: list[str] = []


class RemediationApplyRequest(BaseModel):
    job_id: str
    rule_id: str
    fix_indices: list[int]  # which fixes from the plan to apply


class RemediationApplyResult(BaseModel):
    rows_modified: int
    new_violation_count: int
    previous_violation_count: int
    delta: int
