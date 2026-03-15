# Logic Document — AMMF Data Preparation System

> Complete technical logic reference for all agents, rules, and data flows.

---

## Table of Contents

1. [Pipeline Orchestration](#1-pipeline-orchestration)
2. [File Upload & Parsing](#2-file-upload--parsing)
3. [Schema Mapping Agent](#3-schema-mapping-agent)
4. [Completeness Check](#4-completeness-check)
5. [Relationship Discovery Agent](#5-relationship-discovery-agent)
6. [Data Quality Analysis](#6-data-quality-analysis)
7. [Query Generation Agent](#7-query-generation-agent)
8. [CIB/BIN Auto-Detection](#8-cibbin-auto-detection)
9. [Query Execution](#9-query-execution)
10. [Violation Checker](#10-violation-checker)
11. [Violation Rules (V1–V13)](#11-violation-rules-v1v13)
12. [Violation Count Semantics](#12-violation-count-semantics)
13. [Remediation Agent](#13-remediation-agent)
14. [Web Research Agent](#14-web-research-agent)
15. [LLM Client & Logging](#15-llm-client--logging)
16. [Job Lifecycle & State](#16-job-lifecycle--state)
17. [Report Generation](#17-report-generation)
18. [API Endpoint Reference](#18-api-endpoint-reference)
19. [Frontend Components](#19-frontend-components)
20. [Normalization Strategy](#20-normalization-strategy)

---

## 1. Pipeline Orchestration

**File**: `backend/agents/orchestrator.py`

The pipeline runs as a FastAPI background task. Each step is gated by `job.selected_steps`:

```
Step 1: Schema Mapping      (10%)  → AI Agent (Claude structured_query)
Step 2: Completeness Check   (25%)  → Deterministic comparison against ammf_spec
Step 3: Relationship Discovery(35%) → AI Agent (Claude structured_query)
Step 4: Data Quality Analysis (50%) → Deterministic Pandas analysis
Step 5: Query Generation     (65%)  → AI Agent (Claude sql_query, up to 3 retries)
Step 6: Query Execution      (75%)  → DuckDB SQL execution
Step 7: Violation Checks     (85%)  → 13 deterministic SQL rules
Step 8: Complete             (100%)
```

**Selective execution**: Users can choose a subset of steps. If only `validation` is selected, the system enters **validation-only mode** — it treats the largest uploaded table as the AMMF output and skips directly to violation checks.

**LLM binding**: At the start of each run, `llm_client.bind_job(job)` is called, which:
1. Resets `job.llm_call_logs = []`
2. Points `_active_log_list` to the job's log list
3. Resets `_call_counter = 0`

This ensures each run's LLM logs are isolated and non-cumulative.

---

## 2. File Upload & Parsing

**Files**: `backend/api/routes/upload.py`, `backend/core/file_parser.py`

### Flow
1. User uploads one or more files (`.xlsx`, `.xls`, `.csv`)
2. Each file is saved to `/tmp/ammf_uploads/{job_id}/`
3. Excel files: all sheets parsed (except `dictionary`, `metadata`, `readme` sheets)
4. CSV files: treated as single-table
5. Each sheet/table is registered as:
   - A Pandas DataFrame in `job.tables[sheet_name]`
   - A DuckDB table in `job.db` (in-memory)
6. A `Job` object is created with a UUID-based `job_id`

### Schema Summary Generation
`get_schema_summary()` extracts per-table metadata for LLM prompts:
- Column name, dtype, null count, distinct count
- 3 sample values per column
- 5 sample rows per table

---

## 3. Schema Mapping Agent

**File**: `backend/agents/schema_mapper.py`

### Logic
1. Collects schema summaries from all uploaded tables
2. Sends to Claude with the 31-column AMMF specification
3. Claude analyzes semantic matches between source and target columns
4. Returns per-column mapping with:
   - `source_table` + `source_column` (or null if unmapped)
   - `confidence` (0.0–1.0)
   - `reasoning`
   - `is_derived` flag + `derivation_logic`

### Key Rules in Prompt
- No hardcoded table names — purely data-driven
- Searches ALL uploaded tables for best matches
- ProcessorBINCIB, AcquirerBID, etc. may be in reference tables
- BASEIIName is derived: `AggregatorName + DBAVariant` for PF records, NULL for direct
- MCC2–MCC9 typically left unmapped unless secondary MCC fields exist

### Output
`SchemaMapping` with:
- `mappings[]` — 31 column mapping entries
- `unmapped_required[]` — required AMMF columns with no mapping
- `unmapped_optional[]` — optional AMMF columns with no mapping

---

## 4. Completeness Check

**File**: `backend/agents/completeness_checker.py`

Compares the schema mapping result against `rules/ammf_spec.py`:
- 31 AMMF columns defined with `required: True`, `required: "submerchant"`, or `required: False`
- Reports which required columns have no source mapping

---

## 5. Relationship Discovery Agent

**File**: `backend/agents/relationship_discoverer.py`

### Logic
1. Analyzes all table schemas for join candidates
2. Claude identifies:
   - Primary keys per table
   - Foreign key relationships
   - Table roles (fact, dimension, reference, bridge)
   - Join type (INNER, LEFT, CROSS) and join conditions
3. Returns a structured join plan

### Output
```json
{
  "tables": [{"name": "...", "primary_keys": [...], "role": "fact"}],
  "joins": [{"left_table": "...", "right_table": "...", "join_type": "LEFT", "left_key": "...", "right_key": "..."}],
  "main_table": "merchant_data"
}
```

---

## 6. Data Quality Analysis

**File**: `backend/agents/quality_analyzer.py`

### Logic (Deterministic, No AI)
Per-column analysis using Pandas:
- **Null count / percentage**: `series.isna().sum()`
- **Distinct count**: `series.nunique()`
- **Data type**: `series.dtype`
- **Issues detected**:
  - High null rate (>50%)
  - Entirely null column (100%)
  - Constant column (1 distinct value, >10 rows)
  - All unique (potential PK)
  - Blank/whitespace-only values

### Scoring
```
score = max(0, 100 - avg_null_pct - (issue_count * 5))
```

---

## 7. Query Generation Agent

**File**: `backend/agents/query_generator.py`

### Logic
1. Gathers:
   - Source table schemas
   - Schema mapping results
   - Relationship/join plan
   - CIB/BIN configuration (user-provided or auto-detected)
2. Claude generates a DuckDB SQL query that:
   - Selects exactly 31 AMMF columns
   - Uses CTEs for complex transformations
   - JOINs tables based on discovered relationships
   - Handles derived columns (BASEIIName, AcquirerMerchantID)
   - Injects CIB/BIN values as constants or via JOIN

### Auto-Retry
Up to 3 attempts. On failure:
- Error message is appended to the next prompt
- Claude fixes the SQL based on the error

### Validation
After generation, the SQL is test-executed with `LIMIT 1` to verify it compiles.

---

## 8. CIB/BIN Auto-Detection

**File**: `backend/agents/query_generator.py` (`_auto_detect_cib_bin()`)

### Logic
Scans uploaded tables for processor/acquirer reference values using regex patterns:

| Target Field | Regex Pattern |
|-------------|--------------|
| `processor_name` | `processor.?name\|proc.?name\|cib.?name` |
| `processor_bin_cib` | `processor.?bin.?cib\|processor.?cib\|cib$\|cib.?id` |
| `acquirer_name` | `acquirer.?name\|acq.?name\|bid.?name` |
| `acquirer_bid` | `acquirer.?bid\|bid$\|bid.?id\|acq.?bid` |
| `acquirer_bin` | `acquirer.?bin\|bin$\|bin.?id\|acq.?bin` |

### Search Order
1. **Reference-like tables** (names containing `bin`, `cib`, `bid`, `master`, `processor`, `acquirer`, `reference`)
2. **All other tables**

### Value Selection
For each matched column, picks the **most common non-empty value** (`mode()`).

### Priority Chain
```
User-provided config > Auto-detected from data > NULL (not 0 or 'UNKNOWN')
```

### Frontend Dropdown
`GET /pipeline/reference-values/{job_id}` returns distinct values per field for dropdown selection.

---

## 9. Query Execution

**File**: `backend/agents/orchestrator.py` (step 6)

```python
job.ammf_dataframe = job.db.execute(job.generated_sql)
```

The generated SQL is executed against the job's DuckDB instance. Result is a Pandas DataFrame with 31 AMMF columns.

### Validation-Only Mode
If user selected only `validation` step:
- The largest uploaded table is used directly as `ammf_dataframe`
- No schema mapping or query generation occurs

---

## 10. Violation Checker

**File**: `backend/agents/violation_checker.py`

### Flow
1. Register `ammf_dataframe` as DuckDB table `ammf_output`
2. Execute all 13 violation rule functions against `ammf_output`
3. For each rule with violations:
   - Store full result DataFrame in `job.violation_dataframes[rule_id]`
   - Store 10-row sample in `violation.sample_rows`
   - Compute `group_count` for group-based rules
   - Track unique affected rows by CAID|MID composite key
4. Return `ViolationReport` with totals

---

## 11. Violation Rules (V1–V13)

**File**: `backend/rules/violation_rules.py`

All rules are pure DuckDB SQL queries. No AI involvement.

### V1 — Acquirer Name in Merchant Fields
**Logic**: Flags rows where DBAName, LegalName, or BASEIIName equals the AcquirerName (exact match or Jaro-Winkler similarity > 0.85).
**Affected columns**: DBAName, LegalName, BASEIIName
**Normalization**: `LOWER(TRIM(...))`

### V2 — Street and City Same
**Logic**: Flags rows where Street = City (after lowering/trimming), or where the non-numeric portion of Street matches City.
**Affected columns**: Street, City
**Normalization**: `LOWER(TRIM(...))`, `regexp_replace` to strip numbers

### V3 — Same MID/CAID/DBA, Multiple Addresses
**Logic**: Groups by normalized MID + CAID + DBA, flags groups with >1 distinct address (Street|City|PostalCode).
**Affected columns**: AcquirerMerchantID, CAID, DBAName, Street, City
**Normalization**: MID/CAID use `UPPER(REPLACE(..., ' ', ''))` (space-compressed), DBA/address use `UPPER(TRIM(...))`
**Group-based**: Yes — group key is (CAID, AcquirerMerchantID, DBAName)

### V4 — Invalid Address
**Logic**: Flags PO boxes (`p.o.`, `po box`), short streets (<5 chars), repeated characters, test addresses, and junk values (`xxx`, `na`, `n/a`, `none`, `null`, `tbd`).
**Affected columns**: Street, City

### V5 — Invalid BASEIIName
**Logic**: For rows with AggregatorName (PF records), flags missing BASEIIName or BASEIIName that equals AcquirerName/DBAName/LegalName.
**Affected columns**: BASEIIName, AggregatorName

### V6 — CIB/BID/BIN Copied
**Logic**: Flags rows where any pair of (ProcessorBINCIB, AcquirerBID, AcquirerBIN) have the same non-zero numeric value. Uses `TRY_CAST(... AS BIGINT)` for safe comparison.
**Affected columns**: ProcessorBINCIB, AcquirerBID, AcquirerBIN

### V7 — Invalid CAID
**Logic**: Flags NULL, empty, too short (<3), too long (>15), or non-alphanumeric-only CAIDs.
**Affected columns**: CAID

### V8 — Same Address, Different MIDs
**Logic**: Groups by normalized address (Street|City|PostalCode), flags groups with >1 distinct MID.
**Affected columns**: Street, City, PostalCode, AcquirerMerchantID
**Normalization**: Address uses `UPPER(TRIM(...))`, MID uses `UPPER(REPLACE(..., ' ', ''))`
**Group-based**: Yes — group key is (Street, City, PostalCode)

### V9 — Invalid Business Registration ID
**Logic**: Flags non-null Tax IDs that are too short (<3), junk values (`0`, `NA`, `NONE`, etc.), non-alphanumeric-only, or repeated single character.
**Affected columns**: BusinessRegistrationID

### V10 — Same MID/CAID, Different Names
**Logic**: Groups by normalized MID + CAID, flags groups with >1 distinct DBAName or LegalName.
**Affected columns**: AcquirerMerchantID, CAID, DBAName, LegalName
**Normalization**: MID/CAID space-compressed, names `UPPER(TRIM(...))`
**Group-based**: Yes — group key is (CAID, AcquirerMerchantID)

### V11 — Different MIDs, Same CAID
**Logic**: Groups by normalized CAID, flags groups with >1 distinct MID. Excludes null/empty CAIDs.
**Affected columns**: AcquirerMerchantID, CAID
**Normalization**: Both use `UPPER(REPLACE(..., ' ', ''))`
**Group-based**: Yes — group key is (CAID)

### V12 — BASEIIName Copied to DBA/Legal
**Logic**: Flags non-null BASEIIName that exactly matches DBAName or LegalName.
**Affected columns**: BASEIIName, DBAName, LegalName
**Normalization**: `LOWER(TRIM(CAST(... AS VARCHAR)))`

### V13 — Sub-merchants Same Tax ID
**Logic**: Groups by AggregatorID, flags aggregators where ALL sub-merchants share exactly 1 distinct Tax ID (with >1 merchant).
**Affected columns**: AggregatorID, BusinessRegistrationID
**Group-based**: Yes — group key is (AggregatorID)

---

## 12. Violation Count Semantics

**File**: `backend/agents/violation_checker.py`

Two count types are tracked:

| Metric | Meaning | Where Shown |
|--------|---------|-------------|
| `count` | Total rows returned by the SQL query | "Rows" column in violation table |
| `group_count` | Distinct violation groups | "Groups" column (bold, primary) |

### Group Keys
Group-based rules define specific columns that constitute a "violation group":

| Rule | Group Key Columns |
|------|------------------|
| V3 | CAID, AcquirerMerchantID, DBAName |
| V8 | Street, City, PostalCode |
| V10 | CAID, AcquirerMerchantID |
| V11 | CAID |
| V13 | AggregatorID |

For row-level rules (V1, V2, V4–V7, V9, V12), `group_count == count`.

### Example
V11 with 11 CAIDs sharing multiple MIDs might return 4993 rows but only 11 groups. The UI shows:
- **Groups**: 11 (primary display)
- **Rows**: 4,993 (secondary)

---

## 13. Remediation Agent

**File**: `backend/agents/remediation_agent.py`

### Strategy Map
Each violation rule has a default remediation strategy:

| Strategy | Rules | Behavior |
|----------|-------|----------|
| `auto_fix` | V1, V5, V12 | Deterministic corrections (clear copied names, derive BASEIIName) |
| `web_research` | V2, V4, V9, V10 | Need external data (addresses, tax IDs, merchant names) |
| `manual_review` | V3, V6, V7, V8, V11, V13 | Need acquirer input (ambiguous relationships) |

### Rule-Specific Handlers

**V1 Handler**: If DBAName/LegalName/BASEIIName matches AcquirerName, flag for web research to find actual merchant name.

**V2 Handler**: Street = City — flag for web research to find real address.

**V4 Handler**: Invalid address — flag for web research.

**V5 Handler**: Missing/invalid BASEIIName — auto-derive as `AggregatorName * DBAName`.

**V9 Handler**: Invalid Tax ID — flag for web research.

**V12 Handler**: BASEIIName copied to DBA/Legal — flag for web research to find actual merchant names.

**Generic Handler** (V3, V6, V7, V8, V10, V11, V13): Creates per-row fix stubs flagged for manual review or web research. Caps at 200 rows.

### Fix Application Flow
1. `POST /remediation/plan` → Generate plan for a rule
2. User reviews proposed fixes
3. `POST /remediation/apply` → Apply selected fix indices
4. System modifies `ammf_dataframe` in-place
5. Re-runs the violation rule SQL
6. Returns `{rows_modified, new_violation_count, previous_violation_count, delta}`

### Row Matching
Violation rows are matched back to AMMF DataFrame using composite key: `CAID + AcquirerMerchantID`.

---

## 14. Web Research Agent

**File**: `backend/agents/web_research_agent.py`

### Flow
```
1. Generate Search Queries (Claude)
   → 2-3 targeted queries based on merchant + violation context

2. Execute Web Searches
   → Brave Search API (if BRAVE_SEARCH_API_KEY set)
   → OR Claude knowledge fallback (no API needed)

3. Analyze Findings (Claude)
   → Extract actionable fixes with column, value, reasoning, confidence
```

### Search Query Generation
Claude generates 2–3 queries focused on:
- Official business address and location
- Legal/registered business name
- Business registration numbers (EIN, Tax ID)

### Brave Search Integration
- API: `https://api.search.brave.com/res/v1/web/search`
- Returns top 5 results per query, capped at 3 queries
- Extracts: URL, title, snippet

### Claude Knowledge Fallback
When no Brave API key is configured:
- Claude uses training data to provide business information
- Returns results formatted as search findings with confidence levels
- Less accurate but functional without external API

### Analysis & Fix Suggestion
Claude analyzes all search findings and suggests specific column-level fixes:
```json
{
  "analysis": "Found the merchant's registered address...",
  "suggested_fixes": [
    {"column": "Street", "value": "123 Main St", "reasoning": "...", "confidence": 0.8}
  ]
}
```

### Frontend Integration
The "Research" button on each violation row opens `WebResearchModal`, which:
1. Calls `POST /remediation/research`
2. Displays findings and suggested fixes
3. User can accept/decline each fix
4. Accepted fixes applied via `POST /remediation/apply-web-fix`

---

## 15. LLM Client & Logging

**File**: `backend/core/llm_client.py`

### Architecture
- **Singleton instance**: `llm_client = LLMClient()` — used by all agents
- **Per-job binding**: `bind_job(job)` resets logs on the job object
- **Log storage**: Logs stored on `job.llm_call_logs` (list of `LLMCallLog` objects)

### Query Methods

| Method | Purpose | Output |
|--------|---------|--------|
| `structured_query()` | Tool-use pattern for JSON output | Parsed `dict` from tool call |
| `text_query()` | Free-form text response | `str` |
| `sql_query()` | SQL generation (wraps `structured_query`) | SQL `str` |

### Call Logging
Every LLM call creates an `LLMCallLog` with:
- `call_id` — sequential counter (per job run)
- `method` — which query method was used
- `system_prompt` + `user_prompt` (truncated to 2000/5000 chars)
- `output` (truncated to 5000 chars)
- `input_tokens`, `output_tokens`
- `cost_usd` — computed from pricing table
- `duration_ms`
- `error` — if the call failed

### Cost Calculation
```python
PRICING = {"claude-sonnet-4-20250514": {"input": 3.0, "output": 15.0}}  # per million tokens
cost = (input_tokens * input_price + output_tokens * output_price) / 1_000_000
```

### Log Summary
`summarize_logs(logs)` aggregates all calls for a job run:
```json
{
  "total_calls": 5,
  "total_input_tokens": 12500,
  "total_output_tokens": 3200,
  "total_tokens": 15700,
  "total_cost_usd": 0.0855,
  "total_duration_ms": 8500,
  "calls": [...]
}
```

---

## 16. Job Lifecycle & State

**File**: `backend/core/job_store.py`

### Job Object Fields
```python
class Job:
    job_id: str                          # 8-char UUID prefix
    step: PipelineStep                   # Current pipeline step (enum)
    progress_pct: int                    # 0–100
    messages: list[str]                  # Timestamped progress log
    files: list[FileInfo]               # Uploaded file metadata
    tables: dict[str, DataFrame]        # Parsed source tables
    db: DuckDBEngine                    # Isolated DuckDB instance
    schema_mapping: SchemaMapping       # AI-generated column mappings
    quality_report: QualityReport       # Per-column quality scores
    generated_sql: str                  # DuckDB SQL for transformation
    ammf_dataframe: DataFrame           # The 31-column output
    violation_report: ViolationReport   # Summary with counts + samples
    violation_dataframes: dict          # rule_id → full violation DataFrame
    remediation_plans: dict             # rule_id → RemediationPlan
    llm_call_logs: list                 # LLMCallLog objects (current run only)
    cib_bin_config: dict                # User-provided CIB/BIN values
    selected_steps: list[str]           # Which pipeline steps to run
    error: str                          # Error message if failed
```

### Lifecycle
```
create_job() → UPLOADED → [SCHEMA_MAPPING → COMPLETENESS → RELATIONSHIPS →
    QUALITY → QUERY_GENERATION → EXECUTING → VALIDATION] → COMPLETE
                                                              ↓
                                                            ERROR (on exception)
```

### State Management
- **In-memory only** — `JobStore._jobs` dict
- **No persistence** — server restart clears all jobs
- **One DuckDB per job** — `DuckDBEngine` with `:memory:` connection
- **No concurrent job limit** — but LLM binding is single-job

---

## 17. Report Generation

**File**: `backend/api/routes/reports.py`

### Excel Report Structure
`GET /reports/{job_id}/download` generates a multi-sheet Excel file:

| Sheet | Content |
|-------|---------|
| `Schema Mapping` | All 31 column mappings with confidence, reasoning |
| `DQ_{table_name}` | Per-column quality metrics (one sheet per source table) |
| `Violation Summary` | Rule ID, name, description, affected rows, groups, columns |
| `V_{rule_id}` | Full violation rows per rule (from `violation_dataframes`) |
| `AMMF Data` | Complete 31-column AMMF output |

### Violation Row Export
- Uses `job.violation_dataframes[rule_id]` for full data
- Drops internal columns (prefixed with `_`)
- Falls back to 10-row sample if full DataFrame unavailable

---

## 18. API Endpoint Reference

### Upload
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/upload` | Upload Excel/CSV files, creates job |

### Pipeline Control
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/pipeline/run` | Start pipeline (with optional CIB/BIN config and step selection) |
| `GET` | `/pipeline/status/{job_id}` | Poll pipeline status and progress |
| `GET` | `/pipeline/sql/{job_id}` | Get generated SQL query |
| `GET` | `/pipeline/llm-logs/{job_id}` | Get LLM call logs for latest run |
| `GET` | `/pipeline/reference-values/{job_id}` | Get auto-detected CIB/BIN dropdown values |

### Results
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/schema/{job_id}` | Schema mapping results |
| `PUT` | `/schema/{job_id}` | Update schema mapping (user edits) |
| `GET` | `/quality/{job_id}` | Data quality report |
| `GET` | `/violations/{job_id}` | Violation check results |
| `GET` | `/ammf/{job_id}/preview` | Paginated AMMF output (page, page_size) |
| `GET` | `/ammf/{job_id}/download` | Download AMMF as Excel |
| `GET` | `/reports/{job_id}/download` | Download full report (all sheets) |

### Remediation
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/remediation/rows/{job_id}/{rule_id}` | Paginated violation rows for investigation |
| `POST` | `/remediation/plan` | Generate AI remediation plan for a rule |
| `GET` | `/remediation/plan/{job_id}/{rule_id}` | Get existing remediation plan |
| `POST` | `/remediation/apply` | Apply selected fixes from a plan |
| `POST` | `/remediation/research` | Run web research for a merchant |
| `POST` | `/remediation/apply-web-fix` | Apply web research fixes to a row |

### Health
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check with build version |

---

## 19. Frontend Components

### Page Structure
| Route | Component | API Calls |
|-------|-----------|-----------|
| `/` | Upload page | `POST /upload` |
| `/pipeline/[jobId]` | Pipeline dashboard | `GET /pipeline/status`, `GET /pipeline/reference-values`, `POST /pipeline/run` |

### Components

**FileUploader.tsx** — Drag-and-drop multi-file upload. Accepts `.xlsx`, `.xls`, `.csv`.

**PipelineStepper.tsx** — Shows pipeline progress with step indicators. Polls `GET /pipeline/status/{job_id}` every 2 seconds during execution.

**SchemaMapEditor.tsx** — Editable table showing source→AMMF column mappings. Users can modify mappings before query generation.

**DQReport.tsx** — Per-table, per-column quality metrics with color-coded scores.

**AMMFPreview.tsx** — Paginated table browser for the 31-column AMMF output. Download button.

**ViolationTable.tsx** — Shows all 13 rules with counts. Filter buttons per rule. "Investigate" button expands inline to show `RemediationPanel`.

**RemediationPanel.tsx** — Loads paginated violation rows via `GET /remediation/rows/{job_id}/{rule_id}`. Features:
- Affected columns highlighted (amber background, bold text)
- Empty affected columns shown in red with "(empty)" placeholder
- Key identifier columns prioritized in display order
- "Research" button per row opens WebResearchModal
- 25 rows per page with pagination

**WebResearchModal.tsx** — Modal overlay for web research. Calls `POST /remediation/research`, displays findings and suggested fixes. User can accept/decline each fix.

### Column Prioritization Logic
```
1. Affected columns (from violation rule)
2. Key identifiers: CAID, AcquirerMerchantID, DBAName, LegalName, Street, City, etc.
3. Remaining columns
4. Cap at 14 columns for readability
```

---

## 20. Normalization Strategy

The system uses two distinct normalization approaches based on column semantics:

### Formal Identifiers (CAID, MID)
```sql
UPPER(REPLACE(CAST(col AS VARCHAR), ' ', ''))
```
- Case-insensitive
- Space-compressed (removes ALL spaces, not just leading/trailing)
- Ensures `"caid 123"` and `"CAID123"` are treated as equal
- Used in: V3, V7, V8, V10, V11

### Free-Text Fields (Names, Addresses)
```sql
UPPER(TRIM(CAST(col AS VARCHAR)))
```
- Case-insensitive
- Only trims leading/trailing whitespace (preserves internal spaces)
- Used for: DBAName, LegalName, Street, City, PostalCode

### Why Two Approaches
- TRIM alone was found to mutate identifiers (e.g., `"CAID 123"` stays `"CAID 123"` with TRIM, but should match `"CAID123"`)
- REPLACE of all spaces is too aggressive for names/addresses where spaces are meaningful
- The dual approach balances precision for identifiers with natural handling of text

### Jaro-Winkler Similarity (V1 only)
V1 uses DuckDB's `jaro_winkler_similarity()` with threshold 0.85 to catch near-matches between AcquirerName and merchant name fields (handles typos, abbreviations).
