# Project State

> Last updated: 2026-03-14

## Deployment

| Service | Platform | URL | Status |
|---------|----------|-----|--------|
| Frontend | Vercel | `https://frontend-fawn-one-75.vercel.app` | Live |
| Backend | Railway | Configured via Railway dashboard | Live (v2.1-bind-job) |

### Environment Variables

**Backend (Railway)**:
- `ANTHROPIC_API_KEY` — Claude API key
- `FRONTEND_URL` — Vercel frontend URL (for CORS)
- `BRAVE_SEARCH_API_KEY` — (Optional) Brave Search API for web research

**Frontend (Vercel)**:
- `NEXT_PUBLIC_API_URL` — Railway backend URL

## Current Build Version

`v2.1-bind-job` — verify via `GET /health` returning `{"version": "v2.1-bind-job"}`

## Repository Structure

```
AcquirerData/
├── backend/                   # FastAPI + Python 3.11
│   ├── agents/                # 8 AI/deterministic agents
│   ├── api/routes/            # 8 REST route modules
│   ├── core/                  # Infrastructure (DuckDB, Job Store, LLM Client, Models)
│   ├── rules/                 # AMMF spec, DQ rules, 13 violation rules
│   ├── templates/             # (reserved)
│   ├── Dockerfile             # Python 3.11-slim, uvicorn
│   ├── railway.toml           # Forces DOCKERFILE builder on Railway
│   └── requirements.txt       # FastAPI, DuckDB, Anthropic, Pandas, etc.
├── frontend/                  # Next.js 16 + React 19
│   ├── src/app/               # Pages (upload, pipeline dashboard)
│   ├── src/components/        # 8 UI components
│   └── src/lib/               # API client, types, constants
└── docs/                      # This documentation
```

## Feature Status

### Core Pipeline (All Working)
| Feature | Status | Notes |
|---------|--------|-------|
| File upload (Excel/CSV) | Working | Multi-file, multi-sheet support |
| Schema mapping (AI) | Working | Claude maps source to 31 AMMF columns |
| Completeness check | Working | Identifies missing required fields |
| Relationship discovery (AI) | Working | Discovers PKs, FKs, join paths |
| Data quality analysis | Working | Per-column scoring |
| Query generation (AI) | Working | DuckDB SQL with auto-retry (3 attempts) |
| CIB/BIN auto-detection | Working | Regex scan of reference tables + user dropdown |
| Query execution | Working | Produces ammf_output table |
| Violation checks (V1-V13) | Working | 13 SQL-based compliance rules |
| Selective step execution | Working | User can pick which steps to run |
| Validation-only mode | Working | Upload pre-built AMMF, skip to violations |

### Violation & Remediation (All Working)
| Feature | Status | Notes |
|---------|--------|-------|
| Violation count display | Working | Shows group count + row count for group-based rules |
| Investigate button | Working | Loads paginated violation rows inline |
| Violation row pagination | Working | 25 rows/page with affected column highlighting |
| Web research per row | Working | "Research" button opens WebResearchModal |
| Remediation plan generation | Working | AI generates fix proposals per rule |
| Fix application + re-verify | Working | Apply fixes, re-run rule, show delta |
| Web research agent | Working | Brave Search or Claude knowledge fallback |

### Output & Reports (All Working)
| Feature | Status | Notes |
|---------|--------|-------|
| AMMF preview table | Working | Paginated output browser |
| AMMF Excel download | Working | Full AMMF output as .xlsx |
| Full report download | Working | Schema mapping + DQ + violations + AMMF in one Excel |
| Violation rows in Excel | Working | Full DataFrames per rule (not just 10 samples) |

### LLM Observability (All Working)
| Feature | Status | Notes |
|---------|--------|-------|
| LLM call logging | Working | Per-job, per-run (not cumulative) |
| Token/cost tracking | Working | Input/output tokens, cost per call |
| Call detail viewer | Working | System prompt, user prompt, output, timing |

## Recent Changes (Latest First)

### v2.1-bind-job (Current)
- **LLM logs per-run scoping**: Logs stored on `Job` object via `bind_job()`, reset on each pipeline run. Eliminated singleton state leakage.
- **Investigate button redesign**: "Fix" button renamed to "Investigate". Now immediately loads all violation rows with pagination instead of requiring AI remediation plan generation.
- **Violation row endpoint**: New `GET /remediation/rows/{job_id}/{rule_id}` for paginated violation data.
- **Full violation DataFrames**: Stored on `job.violation_dataframes` dict. Excel download exports all rows, not just 10 samples.
- **Group vs row counts**: Group-based rules (V3, V8, V10, V11, V13) display distinct group count alongside total row count.
- **Railway deployment**: Added `railway.toml` to force DOCKERFILE builder (resolves Railpack errors).

### Earlier
- Violation auto-remediation engine (remediation_agent.py, web_research_agent.py)
- 13 AMMF violation rules with CAID/MID normalization
- Comprehensive documentation (README, ARCHITECTURE, VIOLATION_RULES, REMEDIATION)
- Violation count fix (group count vs row count semantics)

## Known Limitations

1. **In-memory state**: All job data (DuckDB, DataFrames, violation results) lives in server memory. Backend restart clears everything. No persistence layer.
2. **Single-threaded LLM client**: The `llm_client` singleton binds to one job at a time via `bind_job()`. Concurrent pipeline runs would interleave logs. In practice this is fine for single-user usage.
3. **No authentication**: No user auth or API key protection on endpoints.
4. **Brave Search dependency**: Web research falls back to Claude's knowledge if `BRAVE_SEARCH_API_KEY` is not set (less accurate).
5. **Excel row limit**: Very large violation sets (100k+ rows) may slow Excel generation.

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Backend API | FastAPI | 0.115.6 |
| Runtime | Python | 3.11 |
| Database | DuckDB | 1.1.3 (in-memory) |
| AI | Anthropic Claude | claude-sonnet-4-20250514 |
| Data processing | Pandas | 2.2.3 |
| Validation | Pydantic | 2.10.4 |
| HTTP client | httpx | 0.28.1 |
| Excel I/O | openpyxl | 3.1.5 |
| Frontend framework | Next.js | 16 |
| UI library | React | 19 |
| Styling | Tailwind CSS | 4 |
| Language | TypeScript | - |
| Backend hosting | Railway | Docker-based |
| Frontend hosting | Vercel | - |
