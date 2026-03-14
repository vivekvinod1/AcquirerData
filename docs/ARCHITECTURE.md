# Architecture

## Overview

AcquirerData is a hybrid AI + deterministic system that transforms raw acquirer merchant data into Visa's standardized 31-column AMMF (Acquirer Merchant Master File) format. It uses Claude AI agents for intelligent tasks (schema mapping, SQL generation, remediation) and pure SQL rules for compliance checks.

## System Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (Vercel)                        │
│  Next.js 16 / React 19 / TypeScript / Tailwind CSS 4        │
│                                                              │
│  Upload → Config → Pipeline Progress → Results → Remediation │
└──────────────────────────┬──────────────────────────────────┘
                           │ REST API (JSON)
┌──────────────────────────▼──────────────────────────────────┐
│                     Backend (Railway)                         │
│  FastAPI / Python 3.11                                       │
│                                                              │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │  API Routes  │  │  AI Agents   │  │  Rule Engines      │  │
│  │             │  │              │  │                    │  │
│  │  upload     │  │  schema      │  │  ammf_spec (31col) │  │
│  │  pipeline   │──▶│  completeness│  │  dq_rules          │  │
│  │  schema     │  │  relations   │  │  violation_rules   │  │
│  │  quality    │  │  quality     │  │    (V1-V13)        │  │
│  │  ammf       │  │  query_gen   │  │                    │  │
│  │  violations │  │  violation   │  └────────────────────┘  │
│  │  remediation│  │  remediation │                           │
│  │  reports    │  │  web_research│                           │
│  └─────────────┘  └──────┬───────┘                           │
│                          │                                    │
│  ┌───────────────────────▼───────────────────────────────┐  │
│  │                    Core Layer                          │  │
│  │  DuckDB (in-memory)  │  Job Store  │  LLM Client      │  │
│  │  File Parser         │  Config     │  Pydantic Models  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              │                         │
    ┌─────────▼──────┐     ┌───────────▼────────┐
    │ Anthropic Claude│     │ Brave Search API   │
    │ (claude-sonnet) │     │ (web research)     │
    └────────────────┘     └────────────────────┘
```

## Data Flow

### Pipeline Execution

```
1. Upload (Excel/CSV)
   └─▶ Parse files, detect sheets → Load into DuckDB as raw tables

2. Schema Mapping (AI Agent)
   └─▶ Claude analyzes source columns vs 31 AMMF target columns
   └─▶ Produces mapping with confidence scores and reasoning

3. Completeness Check (AI Agent)
   └─▶ Identifies missing required columns
   └─▶ Suggests derivation strategies

4. Relationship Discovery (AI Agent)
   └─▶ Finds join keys between uploaded tables
   └─▶ Proposes JOIN conditions for SQL generation

5. Data Quality Analysis (AI Agent)
   └─▶ Per-column scoring: nulls, distinct values, data types, anomalies

6. Query Generation (AI Agent)
   └─▶ Generates DuckDB SQL (SELECT with CTEs) producing 31 AMMF columns
   └─▶ Auto-detects CIB/BIN from reference tables OR uses user config

7. Execution (Deterministic)
   └─▶ Runs generated SQL on DuckDB → Produces ammf_output table

8. Violation Checks (Deterministic)
   └─▶ Runs 13 SQL-based compliance rules (V1-V13)
   └─▶ Reports violations with sample rows

9. Remediation (AI Agent + Optional)
   └─▶ Per-rule fix proposals (auto_fix / web_research / manual_review)
   └─▶ Web research for address/name verification
   └─▶ Apply fixes → Re-run violations → Before/after delta
```

### Job Lifecycle

Each file upload creates a `Job` object stored in memory:

```python
Job:
  job_id: str              # UUID
  status: PipelineStep     # Current step
  files: list[FileInfo]    # Uploaded file metadata
  db: DuckDBEngine         # Isolated DuckDB instance
  schema_mapping: SchemaMapping
  quality_report: QualityReport
  generated_sql: str
  ammf_dataframe: DataFrame
  violation_report: ViolationReport
  messages: list[str]      # Progress log
  cib_bin_config: CIBBINConfig | None
```

Jobs are ephemeral (in-memory only). Restarting the backend clears all jobs.

## AI Agents

### Schema Mapper (`agents/schema_mapper.py`)
- **Input**: Source table schemas (column names, types, sample values)
- **Output**: `SchemaMapping` with per-column mapping, confidence, reasoning
- **Key behavior**: Fully dynamic — no hardcoded table names. Adapts to any number of input tables (5, 12, or more). Looks for CIB/BIN values in actual uploaded data.

### Query Generator (`agents/query_generator.py`)
- **Input**: Schema mapping + source schemas + CIB/BIN config
- **Output**: DuckDB SQL query producing 31 AMMF columns
- **Key behavior**:
  - Auto-detects CIB/BIN values from reference tables using regex column matching
  - Merges: user config → auto-detected → defaults (0/UNKNOWN)
  - Generates appropriate JOINs based on discovered relationships

### Remediation Agent (`agents/remediation_agent.py`)
- **Input**: Violation rule ID + affected rows from AMMF output
- **Output**: `RemediationPlan` with fix proposals
- **Strategy map**: Each violation rule has a default strategy:
  - `auto_fix`: V1, V5, V12 (deterministic corrections)
  - `web_research`: V2, V4, V9, V10 (need external data)
  - `manual_review`: V3, V6, V7, V8, V11, V13 (need acquirer input)

### Web Research Agent (`agents/web_research_agent.py`)
- **Input**: Merchant name + violation context + user objective
- **Output**: `WebResearchResult` with findings and suggested fixes
- **Flow**: Generate search queries → Brave API search → Claude analysis → Suggested fixes
- **User interaction**: Results presented for accept/decline

## CIB/BIN Auto-Detection

Reference values (ProcessorBINCIB, ProcessorName, AcquirerBID, AcquirerName, AcquirerBIN) are resolved in priority order:

```
1. User Selection (dropdown on pipeline config page)
   ↓ if not selected
2. Auto-Detection (regex scan of reference tables)
   ↓ if not found
3. Defaults (0 / "UNKNOWN")
```

**Auto-detection process**:
1. Identify reference-like tables (names containing "bin", "cib", "bid", "master", "reference")
2. For each target field, scan columns using regex patterns
3. Pick the most common non-empty value from the matched column
4. Frontend shows detected values as dropdown options with source table info

## API Endpoints

### Upload
| Method | Path | Description |
|--------|------|-------------|
| POST | `/upload/` | Upload Excel/CSV files |

### Pipeline
| Method | Path | Description |
|--------|------|-------------|
| POST | `/pipeline/start` | Start pipeline execution |
| GET | `/pipeline/status/{job_id}` | Poll pipeline status |
| GET | `/pipeline/reference-values/{job_id}` | Get CIB/BIN dropdown values |

### Results
| Method | Path | Description |
|--------|------|-------------|
| GET | `/schema/{job_id}` | Schema mapping results |
| GET | `/quality/{job_id}` | Data quality report |
| GET | `/ammf/{job_id}` | AMMF output preview |
| GET | `/ammf/{job_id}/download` | Download AMMF as Excel |
| GET | `/violations/{job_id}` | Violation check results |

### Remediation
| Method | Path | Description |
|--------|------|-------------|
| POST | `/remediation/plan` | Generate fix plan for a rule |
| POST | `/remediation/apply` | Apply selected fixes |
| POST | `/remediation/research` | Web research for a merchant |
| POST | `/remediation/apply-web-fix` | Apply web research fix |
| POST | `/remediation/re-verify` | Re-run violations after fixes |

### Reports
| Method | Path | Description |
|--------|------|-------------|
| GET | `/reports/{job_id}/summary` | Full pipeline summary |
| GET | `/reports/{job_id}/llm-logs` | LLM interaction logs |

## Frontend Pages

| Route | Component | Purpose |
|-------|-----------|---------|
| `/` | Upload page | Drag-and-drop file upload |
| `/pipeline/[jobId]` | Pipeline dashboard | CIB/BIN config, step progress |
| `/pipeline/[jobId]/schema` | Schema mapping | Review/edit column mappings |
| `/pipeline/[jobId]/quality` | Quality report | Per-column quality scores |
| `/pipeline/[jobId]/sql` | SQL review | View/copy generated SQL |
| `/pipeline/[jobId]/ammf` | AMMF preview | Browse output, download Excel |
| `/pipeline/[jobId]/violations` | Violations | Results table + Fix buttons |
| `/pipeline/[jobId]/llm-logs` | LLM logs | Full AI interaction history |
