import uuid
from datetime import datetime
from core.models import PipelineStep, PipelineStatus, SchemaMapping, QualityReport, ViolationReport
from core.db_engine import DuckDBEngine
import pandas as pd


class Job:
    def __init__(self, job_id: str):
        self.job_id = job_id
        self.step = PipelineStep.UPLOADED
        self.progress_pct = 0
        self.messages: list[str] = []
        self.started_at: str | None = None
        self.completed_at: str | None = None
        self.files: list = []
        self.tables: dict[str, pd.DataFrame] = {}
        self.db: DuckDBEngine | None = None
        self.schema_mapping: SchemaMapping | None = None
        self.quality_report: QualityReport | None = None
        self.violation_report: ViolationReport | None = None
        self.generated_sql: str | None = None
        self.ammf_dataframe: pd.DataFrame | None = None
        self.cib_bin_config: dict | None = None
        self.selected_steps: list[str] | None = None  # None = all
        self.error: str | None = None
        self.violation_dataframes: dict[str, pd.DataFrame] = {}  # rule_id -> full violation rows
        self.remediation_plans: dict[str, "RemediationPlan"] = {}  # rule_id -> plan
        self.llm_call_logs: list = []  # LLMCallLog objects for this job's latest run
        self.selected_violations: list[str] | None = None  # Which V-rules to run (None = defaults)
        self.ingestion_dq_report: QualityReport | None = None  # DQ on raw input (pre-mapping)
        self.schema_approved: bool = False
        self.chat_history: list[dict] = []  # [{role, content}]

    def get_status(self) -> PipelineStatus:
        return PipelineStatus(
            job_id=self.job_id,
            step=self.step,
            progress_pct=self.progress_pct,
            messages=self.messages[-20:],
            started_at=self.started_at,
            completed_at=self.completed_at,
        )

    def add_message(self, msg: str):
        self.messages.append(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

    def set_step(self, step: PipelineStep, progress: int):
        self.step = step
        self.progress_pct = progress


class JobStore:
    def __init__(self):
        self._jobs: dict[str, Job] = {}

    def create_job(self) -> Job:
        job_id = str(uuid.uuid4())[:8]
        job = Job(job_id)
        self._jobs[job_id] = job
        return job

    def get_job(self, job_id: str) -> Job | None:
        return self._jobs.get(job_id)

    def list_jobs(self) -> list[str]:
        return list(self._jobs.keys())


job_store = JobStore()
