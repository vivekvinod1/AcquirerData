# AcquirerData - AMMF Data Preparation

Agentic AI utility for Acquirer Merchant Master File (AMMF) preparation and compliance validation. Built for Visa acquirers to transform raw merchant data into the standardized 31-column AMMF format using Claude AI agents and deterministic rule engines.

## Architecture

```
AcquirerData/
├── backend/                    # FastAPI + DuckDB + Claude AI agents
│   ├── agents/                 # 8 AI agents
│   │   ├── schema_mapper.py        # Maps source columns to AMMF spec
│   │   ├── completeness_checker.py  # Checks for missing required data
│   │   ├── relationship_discoverer.py # Discovers table relationships
│   │   ├── quality_analyzer.py      # Assesses data quality per column
│   │   ├── query_generator.py       # Generates DuckDB SQL for transformation
│   │   ├── violation_checker.py     # Orchestrates 13 violation rules
│   │   ├── remediation_agent.py     # Generates fix proposals per violation
│   │   └── web_research_agent.py    # Agentic web research for merchant data
│   ├── api/routes/             # REST endpoints
│   │   ├── upload.py               # File upload and parsing
│   │   ├── pipeline.py             # Pipeline orchestration + reference values
│   │   ├── schema.py               # Schema mapping results
│   │   ├── quality.py              # Data quality reports
│   │   ├── ammf.py                 # AMMF output preview and download
│   │   ├── violations.py           # Violation check results
│   │   ├── remediation.py          # Auto-remediation + web research endpoints
│   │   └── reports.py              # Downloadable reports
│   ├── core/                   # Infrastructure
│   │   ├── config.py               # Environment config
│   │   ├── db_engine.py            # DuckDB in-memory engine (per-job)
│   │   ├── file_parser.py          # Excel/CSV parser + schema summary
│   │   ├── job_store.py            # In-memory job state management
│   │   ├── llm_client.py           # Anthropic Claude API client
│   │   └── models.py               # Pydantic models (pipeline, remediation)
│   └── rules/                  # Deterministic rule engines
│       ├── ammf_spec.py            # 31-column AMMF specification
│       ├── dq_rules.py             # Data quality scoring rules
│       └── violation_rules.py      # 13 AMMF compliance violation rules (V1-V13)
├── frontend/                   # Next.js 16 + React 19 + Tailwind CSS 4
│   ├── src/app/                # Pages
│   │   ├── page.tsx                # Upload page
│   │   └── pipeline/[jobId]/       # Pipeline dashboard
│   │       ├── page.tsx            # Config + step progress
│   │       ├── schema/             # Schema mapping review
│   │       ├── quality/            # Data quality report
│   │       ├── sql/                # Generated SQL review
│   │       ├── ammf/               # AMMF output preview
│   │       ├── violations/         # Violation results + remediation
│   │       └── llm-logs/           # LLM interaction logs
│   ├── src/components/         # UI components
│   │   ├── FileUploader.tsx        # Drag-and-drop file upload
│   │   ├── PipelineStepper.tsx     # Pipeline step progress
│   │   ├── SchemaMapEditor.tsx     # Schema mapping editor
│   │   ├── DQReport.tsx            # Data quality report
│   │   ├── AMMFPreview.tsx         # AMMF output table
│   │   ├── ViolationTable.tsx      # Violation results with Fix buttons
│   │   ├── RemediationPanel.tsx    # Fix proposals + apply flow
│   │   └── WebResearchModal.tsx    # Web research results + accept/decline
│   └── src/lib/                # Shared utilities
│       ├── api.ts                  # API client functions
│       ├── types.ts                # TypeScript interfaces
│       └── constants.ts            # AMMF column definitions
└── docs/                       # Documentation
    ├── ARCHITECTURE.md             # System architecture deep dive
    ├── VIOLATION_RULES.md          # All 13 violation rules explained
    └── REMEDIATION.md              # Auto-remediation engine guide
```

## Pipeline

8-step agentic pipeline:

```
Upload → Schema Mapping → Completeness → Relationships → Data Quality → Query Generation → Execution → Violation Checks
                                                                                                              ↓
                                                                                              Auto-Remediation + Web Research
```

1. **Upload**: Parse Excel/CSV files, detect sheets, load into DuckDB
2. **Schema Mapping**: AI maps source columns to 31 AMMF target columns
3. **Completeness**: Check for missing required columns
4. **Relationships**: Discover join keys between uploaded tables
5. **Data Quality**: Score each column (nulls, distinct values, data types)
6. **Query Generation**: AI generates DuckDB SQL with auto-detected CIB/BIN values
7. **Execution**: Run generated SQL to produce AMMF output
8. **Violation Checks**: Run 13 compliance rules (V1-V13)
9. **Remediation** (optional): AI-driven fix proposals + web research

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend API | FastAPI (Python 3.11) |
| Database | DuckDB (in-memory, per-job) |
| AI | Anthropic Claude (claude-sonnet-4-20250514) |
| Data | Pandas, Pydantic |
| Frontend | Next.js 16, React 19, TypeScript |
| Styling | Tailwind CSS 4 |
| Backend Hosting | Railway |
| Frontend Hosting | Vercel |

## Deployment

| Service | Platform | URL |
|---------|----------|-----|
| Backend API | Railway | `https://<railway-domain>` |
| Frontend | Vercel | `https://frontend-fawn-one-75.vercel.app` |

### Backend (Railway)

1. Connect this repo to Railway
2. Set root directory to `backend`
3. Add environment variables:
   - `ANTHROPIC_API_KEY` - Claude API key
   - `FRONTEND_URL` - Your Vercel frontend URL

### Frontend (Vercel)

1. Connect this repo to Vercel
2. Set root directory to `frontend`
3. Set scope to `vivekvinod-6191s-projects`
4. Add environment variable:
   - `NEXT_PUBLIC_API_URL` - Your Railway backend URL

## Local Development

```bash
# Backend
cd backend
pip install -r requirements.txt
cp .env.example .env  # Add your API key
uvicorn main:app --reload --port 8000

# Frontend
cd frontend
npm install
cp .env.example .env.local  # Set API URL
npm run dev
```

## Key Design Decisions

- **Hybrid AI + Deterministic**: AI agents handle mapping and query generation; violation rules are pure SQL for reproducibility
- **CAID/MID Normalization**: `UPPER(REPLACE(CAST(col AS VARCHAR), ' ', ''))` — case-insensitive, space-compressed, no TRIM (which was found to mutate identifiers)
- **Dynamic Schema Mapping**: No hardcoded table names or structures — the mapper adapts to any number of input tables (5, 12, or more)
- **CIB/BIN Auto-Detection**: Regex-based column matching on uploaded reference tables, with user dropdown override
- **Job-Based State**: Each upload creates an isolated job with its own DuckDB instance and state

## Documentation

See the `docs/` folder for detailed documentation:
- [Architecture](docs/ARCHITECTURE.md) - System design, data flow, agent details
- [Violation Rules](docs/VIOLATION_RULES.md) - All 13 rules with SQL logic and normalization
- [Remediation Engine](docs/REMEDIATION.md) - Auto-fix, web research, and apply flow
