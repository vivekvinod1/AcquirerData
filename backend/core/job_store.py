import uuid
import json
import os
from pathlib import Path
from datetime import datetime
from core.models import PipelineStep, PipelineStatus, JobSummary, SchemaMapping, QualityReport, ViolationReport, DataDictionaryEntry
from core.db_engine import DuckDBEngine
import pandas as pd

# Persist job summaries to survive server restarts
_DATA_DIR = Path(os.environ.get("AMMF_DATA_DIR", "/tmp/ammf_data"))
_JOBS_FILE = _DATA_DIR / "jobs.json"


class Job:
    def __init__(self, job_id: str):
        self.job_id = job_id
        self.created_at: str = datetime.now().isoformat()
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
        self.data_dictionary: list[DataDictionaryEntry] | None = None  # Extracted from dictionary sheets
        self.user_instructions: str | None = None  # Free-form notes for SQL generation
        self.schema_fingerprint: str | None = None
        self.template_applied: bool = False
        self.force_review: bool = False

    def get_status(self) -> PipelineStatus:
        return PipelineStatus(
            job_id=self.job_id,
            step=self.step,
            progress_pct=self.progress_pct,
            messages=self.messages[-20:],
            started_at=self.started_at,
            completed_at=self.completed_at,
        )

    def get_summary(self) -> JobSummary:
        total_rows = sum(len(df) for df in self.tables.values()) if self.tables else 0
        violation_count = self.violation_report.total_violations if self.violation_report else None
        return JobSummary(
            job_id=self.job_id,
            step=self.step,
            progress_pct=self.progress_pct,
            started_at=self.started_at,
            completed_at=self.completed_at,
            created_at=self.created_at,
            file_names=[f.name for f in self.files],
            total_rows=total_rows,
            violation_count=violation_count,
        )

    def add_message(self, msg: str):
        self.messages.append(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

    def set_step(self, step: PipelineStep, progress: int):
        self.step = step
        self.progress_pct = progress
        # Persist summary on every state change
        _persist_job_summary(self)

    def to_summary_dict(self) -> dict:
        """Serializable summary dict for persistence."""
        total_rows = sum(len(df) for df in self.tables.values()) if self.tables else 0
        violation_count = self.violation_report.total_violations if self.violation_report else None
        return {
            "job_id": self.job_id,
            "step": self.step.value if isinstance(self.step, PipelineStep) else self.step,
            "progress_pct": self.progress_pct,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "created_at": self.created_at,
            "file_names": [f.name for f in self.files] if self.files else [],
            "total_rows": total_rows,
            "violation_count": violation_count,
            "error": self.error,
        }


def _persist_job_summary(job: Job):
    """Write/update this job's summary in the persistent JSON file."""
    try:
        _DATA_DIR.mkdir(parents=True, exist_ok=True)
        existing: dict = {}
        if _JOBS_FILE.exists():
            existing = json.loads(_JOBS_FILE.read_text())
        existing[job.job_id] = job.to_summary_dict()
        _JOBS_FILE.write_text(json.dumps(existing, indent=2))
    except Exception:
        pass  # Non-fatal: persistence is best-effort


def _load_persisted_summaries() -> dict[str, dict]:
    """Load previously persisted job summaries from disk."""
    try:
        if _JOBS_FILE.exists():
            return json.loads(_JOBS_FILE.read_text())
    except Exception:
        pass
    return {}


class JobStore:
    def __init__(self):
        self._jobs: dict[str, Job] = {}
        self._persisted: dict[str, dict] = _load_persisted_summaries()

    def create_job(self) -> Job:
        job_id = str(uuid.uuid4())[:8]
        job = Job(job_id)
        self._jobs[job_id] = job
        return job

    def get_job(self, job_id: str) -> Job | None:
        return self._jobs.get(job_id)

    def list_jobs(self) -> list[str]:
        """Return all job IDs: live + persisted (deduplicated)."""
        all_ids = set(self._jobs.keys())
        all_ids.update(self._persisted.keys())
        return list(all_ids)

    def get_summary(self, job_id: str) -> JobSummary | None:
        """Get summary from live job if available, else from persisted data."""
        job = self._jobs.get(job_id)
        if job:
            return job.get_summary()
        # Fall back to persisted summary
        data = self._persisted.get(job_id)
        if data:
            return JobSummary(
                job_id=data["job_id"],
                step=data.get("step", "complete"),
                progress_pct=data.get("progress_pct", 100),
                started_at=data.get("started_at"),
                completed_at=data.get("completed_at"),
                created_at=data.get("created_at", ""),
                file_names=data.get("file_names", []),
                total_rows=data.get("total_rows", 0),
                violation_count=data.get("violation_count"),
            )
        return None


job_store = JobStore()
