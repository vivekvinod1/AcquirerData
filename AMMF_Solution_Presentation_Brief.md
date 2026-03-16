# AMMF Data Preparation Solution — Presentation Brief

---

## Slide 1: Title

**AI-Powered AMMF Data Preparation & Compliance Validation**
Intelligent automation for Acquirer Merchant Master File transformation

EXL x Visa

---

## Slide 2: The Problem

**Current State:**
- Acquirers submit merchant data in wildly different formats — different table structures, column names, file types
- Manual mapping of source columns to 31 AMMF target columns is time-consuming and error-prone
- Compliance violations (duplicate addresses, invalid IDs, copied acquirer names) are caught late or missed entirely
- Each new acquirer data feed requires analysts to start from scratch
- No standardized way to validate, remediate, or audit the transformation process

**Impact:**
- Days of manual effort per acquirer submission
- Inconsistent data quality across acquirers
- Compliance gaps caught downstream at higher cost
- No audit trail for how mapping and transformation decisions were made

---

## Slide 3: The Solution — Overview

**An agentic AI utility that automates the end-to-end AMMF data preparation lifecycle**

Upload raw acquirer files → AI maps columns → Human reviews → SQL generated → AMMF produced → Violations detected → Remediation guided

**Three core capabilities:**
1. **Intelligent Schema Mapping** — AI maps any source structure to 31 AMMF columns
2. **Automated SQL Generation** — Generates and executes transformation queries
3. **Compliance Validation** — 13 deterministic violation rules with guided remediation

**Key principle:** Hybrid AI + Deterministic — AI handles intelligent tasks (mapping, SQL generation, research); violation rules are pure SQL for reproducibility and auditability

---

## Slide 4: Process Flow

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   UPLOAD     │────→│   PHASE 1        │────→│  MAPPING REVIEW │
│ .xlsx/.csv   │     │ • Input DQ       │     │  (Human Gate)   │
│              │     │ • Schema Mapping  │     │ • Edit mappings │
│              │     │ • Completeness    │     │ • Set violations│
└─────────────┘     └──────────────────┘     └────────┬────────┘
                                                       │ Approve
                    ┌──────────────────┐               ▼
                    │   PHASE 2        │◄──────────────┘
                    │ • Relationships   │
                    │ • Data Quality    │
                    │ • SQL Generation  │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐     ┌─────────────────┐
                    │   SQL REVIEW     │────→│   PHASE 3       │
                    │  (Human Gate)    │     │ • Execute SQL    │
                    │ • View/edit SQL  │     │ • Run Violations │
                    └──────────────────┘     │ • Generate AMMF  │
                                             └────────┬────────┘
                                                      │
                                             ┌────────▼────────┐
                                             │   RESULTS       │
                                             │ • AMMF Download  │
                                             │ • Violation Rpt  │
                                             │ • Remediation    │
                                             └─────────────────┘
```

**Two human approval gates** ensure quality before irreversible steps:
1. **Mapping Review** — Analyst verifies AI-proposed column mappings before SQL is generated
2. **SQL Review** — Analyst reviews generated query before execution against data

---

## Slide 5: AI Agents Architecture

**8 specialized AI agents orchestrated in sequence:**

| # | Agent | Purpose | AI/Deterministic |
|---|-------|---------|-----------------|
| 1 | **Schema Mapper** | Maps source columns → 31 AMMF columns with ranked alternatives | AI (Claude) |
| 2 | **Completeness Checker** | Validates all required AMMF fields are mapped | AI (Claude) |
| 3 | **Relationship Discoverer** | Detects primary/foreign keys and join paths between tables | AI (Claude) |
| 4 | **Quality Analyzer** | Profiles null rates, data types, anomalies per column | AI (Claude) |
| 5 | **Query Generator** | Produces DuckDB SQL for the full transformation | AI (Claude) |
| 6 | **SQL Executor** | Runs generated SQL, produces 31-column AMMF output | Deterministic |
| 7 | **Violation Checker** | Executes 13 compliance rules against AMMF output | Deterministic (SQL) |
| 8 | **Web Research Agent** | Searches the web to validate/correct merchant data | AI (Claude + Brave) |

**Design choice:** Violation checking is pure SQL — no AI interpretation of compliance rules. This ensures reproducibility and auditability for regulatory requirements.

---

## Slide 6: Intelligent Schema Mapping

**The core challenge:** Every acquirer sends data differently — different table counts, column names, structures, and conventions.

**How it works:**
- AI analyzes ALL uploaded tables and columns simultaneously
- Returns **ranked candidate mappings** (up to 5 per AMMF column) with confidence scores
- Supports **data dictionary upload** — dictionary descriptions are prioritized over raw column names
- Detects **derived columns** that require transformation logic (e.g., BASEIIName = AggregatorName + DBAName for Payment Facilitator records)
- Auto-detects **reference values** (CIB, BIN, BID, processor names) from uploaded data

**Human review:**
- Analyst sees top-ranked mapping with dropdown to swap to alternatives
- Can override any mapping manually
- Affected columns highlighted, confidence scores visible

**Template reuse:**
- Save approved mappings as templates (fingerprinted by schema structure)
- On subsequent uploads with identical structure, template auto-applies — skipping AI call and human review entirely
- "Force Review" override available if needed

---

## Slide 7: Compliance Violation Rules (V1–V13)

| Rule | Violation | What It Catches | Strategy |
|------|-----------|-----------------|----------|
| V1 | Acquirer Name in Merchant Fields | DBA/Legal name copied from acquirer name | Auto-fix |
| V2 | Street and City Same | Address fields duplicated | Web Research |
| V3 | Same MID/CAID Multiple Addresses | Inconsistent location data for same merchant | Manual Review |
| V4 | Invalid Address | PO boxes, placeholder values, junk strings | Web Research |
| V5 | Invalid BASEIIName | PF record naming convention violations | Auto-fix |
| V6 | CIB/BID/BIN Copied | Duplicate processor identifiers across merchants | Manual Review |
| V7 | Invalid CAID | Format violations (length, characters) | Manual Review |
| V8 | Same Address Different MIDs | Ambiguous merchant ID assignment | Manual Review |
| V9 | Invalid Business Registration ID | Placeholder or invalid tax IDs | Web Research |
| V10 | Same MID/CAID Different Names | Name inconsistency for same merchant | Web Research |
| V11 | Different MIDs Same CAID | MID/CAID relationship violations | Manual Review |
| V12 | BASEIIName Copied to DBA/Legal | Name field duplication from BASEIIName | Auto-fix |
| V13 | Sub-merchants Same Tax ID | Tax ID sharing under aggregators | Manual Review |

**Three remediation strategies:**
- **Auto-fix (V1, V5, V12):** Deterministic corrections applied automatically
- **Web Research (V2, V4, V9, V10):** AI-powered web search finds correct merchant data
- **Manual Review (V3, V6, V7, V8, V11, V13):** Flagged for analyst judgment

**Fully configurable:** Rules can be enabled/disabled, SQL edited, custom rules (V14+) added via Settings.

---

## Slide 8: Agentic Web Research for Remediation

**When a violation requires external data (V2, V4, V9, V10):**

1. Analyst clicks **"Investigate"** on a violation rule → sees all affected rows with highlighted columns
2. Clicks **"Research"** on a specific merchant row
3. AI generates targeted search queries based on merchant name + violation context
4. Brave Search API executes queries (falls back to Claude knowledge if unavailable)
5. AI analyzes search results and extracts suggested fixes with reasoning
6. Analyst sees **before → after** comparison with confidence and source
7. Accept or decline each suggested fix
8. Accepted fixes applied to AMMF output in real-time

**Example:** Violation V4 flags "123 MAIN ST" as potentially invalid → Web research finds the business at "123 Main Street, Suite 200, Springfield, IL 62704" → Suggests corrected address with source URL

---

## Slide 9: AMMF Output (31 Columns)

**Processor/Acquirer (6)**
ProcessorBINCIB, ProcessorName, AcquirerBID, AcquirerName, AcquirerBIN, LocationCountry

**Merchant Identity (5)**
AcquirerMerchantID, CAID, DBAName, LegalName, CorporateStatus

**Sub-Merchant/Aggregator (3)**
AggregatorID, AggregatorName, AggregatorType, BASEIIName

**Address (4)**
Street, City, StateProvinceCode, PostalCode

**Business Classification (10+)**
MCC1–MCC9, BusinessRegistrationID, CorporateName, DateSigned, CardAcceptorIDCode

**Payment Facilitator logic built in:**
- Direct merchants → AcquirerMerchantID from direct ID field
- PF sub-merchants → AcquirerMerchantID from SubMerchantID, BASEIIName derived from AggregatorName + DBAName

---

## Slide 10: Results & Downloadable Outputs

**Violation Summary Dashboard:**
- Total AMMF records produced
- Clean records count and percentage (green progress bar)
- Records with violations count and percentage (red progress bar)
- Per-rule breakdown with group and row counts

**Downloads:**
- **AMMF Excel** — Full 31-column output + Violations column (count of rules failed per row)
- **Full Report** — Multi-sheet Excel with schema mapping, data quality scores, violation details, and AMMF output
- **Violation DataFrames** — All affected rows per rule (not just samples) for downstream analysis

---

## Slide 11: Observability & Auditability

**LLM Control Panel** — Full transparency into every AI decision:
- Every Claude API call logged with system prompt, user prompt, and response
- Token counts (input/output) and estimated cost per call
- Call timing and model version
- Logs reset per pipeline run for clean attribution

**Audit trail:**
- Schema mapping decisions with confidence scores and alternatives considered
- Generated SQL query (reviewable and editable before execution)
- Violation rule SQL (deterministic, inspectable, customizable)
- Web research queries, results, and applied fixes

**Why this matters:** Regulatory and compliance teams can trace every data transformation decision back to its source — whether it was an AI recommendation, a human override, or a deterministic rule.

---

## Slide 12: Configuration & Flexibility

**Pipeline modes:**
- **Full Pipeline** — Upload → Map → Generate SQL → Execute → Validate (for new data feeds)
- **Violations Only** — Skip to compliance checks (for pre-built AMMF data)

**Customizable at every level:**
- Enable/disable individual pipeline steps
- Select which violation rules to execute per run
- Edit violation rule SQL, names, descriptions
- Create custom rules (V14+) for acquirer-specific checks
- Override auto-detected CIB/BIN/BID values
- Add user instructions that guide SQL generation (e.g., "Filter to active merchants only")

**Saved mapping templates:**
- Fingerprint-based schema matching
- Auto-skip human review for known data structures
- Manage templates in Settings (view, delete, reset)

---

## Slide 13: Business Impact

**Time savings:**
- Schema mapping: Manual hours → minutes (AI maps + human verifies)
- SQL generation: No manual query writing — AI generates, human reviews
- Violation checking: 13 rules executed simultaneously in seconds
- Remediation: Web research automates merchant data lookup

**Quality improvement:**
- Consistent application of 13 compliance rules across all acquirer feeds
- Ranked mapping alternatives reduce incorrect column assignments
- Two human approval gates catch errors before they propagate

**Scalability:**
- Template reuse means repeat submissions from the same acquirer require zero human intervention
- Custom rules allow per-acquirer compliance requirements without code changes
- Any number of input tables and columns supported — no hardcoded schema assumptions

**Auditability:**
- Every AI decision logged and inspectable
- Deterministic violation rules ensure reproducible compliance results
- Full report generation for regulatory documentation

---

## Slide 14: Technology Stack

| Layer | Technology |
|-------|-----------|
| AI Engine | Anthropic Claude (Sonnet) |
| Backend | Python 3.11, FastAPI |
| Query Engine | DuckDB (in-memory, per-job isolation) |
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS |
| Web Search | Brave Search API |
| File Processing | Pandas, openpyxl |
| Backend Hosting | Railway (Docker) |
| Frontend Hosting | Vercel |

**Architecture highlights:**
- Stateless backend with per-job DuckDB instances (no shared database state)
- Background task processing with real-time status streaming
- Modular agent design — each agent is independently testable and replaceable

---

## Slide 15: Live Demo Flow

1. **Upload** — Drag and drop acquirer Excel files
2. **Watch** — Animated progress panel shows each step executing in real-time
3. **Review Mapping** — See AI-proposed column mappings, swap alternatives, add instructions
4. **Review SQL** — Inspect generated transformation query, edit if needed
5. **View Results** — Browse AMMF output, check violation summary dashboard
6. **Investigate** — Drill into violation rows, research merchants, apply fixes
7. **Download** — Export AMMF with violations column, full multi-sheet report
8. **Re-run** — Upload same structure again → template auto-applies → zero-touch processing

---

## Appendix A: AMMF Column Reference

| # | Column | Required | Description |
|---|--------|----------|-------------|
| 1 | ProcessorBINCIB | Yes | Processor identifier |
| 2 | ProcessorName | Yes | Processor name |
| 3 | AcquirerBID | Yes | Acquirer Business ID |
| 4 | AcquirerName | Yes | Acquirer name |
| 5 | AcquirerBIN | Yes | Acquirer BIN |
| 6 | LocationCountry | Yes | Country code |
| 7 | AcquirerMerchantID | Yes | Merchant identifier (SubMerchantID for PF) |
| 8 | CAID | Yes | Card Acceptor ID |
| 9 | DBAName | Yes | Doing Business As name |
| 10 | LegalName | Yes | Legal entity name |
| 11 | Street | Yes | Street address |
| 12 | City | Yes | City |
| 13 | StateProvinceCode | No | State/province |
| 14 | PostalCode | No | Postal/ZIP code |
| 15 | MCC1 | Yes | Primary MCC code |
| 16 | MCC2–MCC9 | No | Additional MCC codes |
| 17 | BusinessRegistrationID | No | Tax ID / registration number |
| 18 | AggregatorID | Conditional | Payment Facilitator ID |
| 19 | AggregatorName | Conditional | Payment Facilitator name |
| 20 | AggregatorType | Conditional | Payment Facilitator type |
| 21 | BASEIIName | Conditional | Derived: AggregatorName + DBAName (PF only) |
| 22 | CorporateStatus | No | Active/Inactive |
| 23 | CorporateName | No | Corporate entity name |
| 24 | DateSigned | No | Agreement date |
| 25 | CardAcceptorIDCode | No | Card acceptor ID |

---

## Appendix B: Violation Rule SQL Examples

**V1 — Acquirer Name in Merchant Fields:**
```sql
SELECT * FROM ammf
WHERE UPPER(TRIM(DBAName)) = UPPER(TRIM(AcquirerName))
   OR UPPER(TRIM(LegalName)) = UPPER(TRIM(AcquirerName))
```

**V4 — Invalid Address:**
```sql
SELECT * FROM ammf
WHERE Street ILIKE '%P.O.%' OR Street ILIKE '%PO BOX%'
   OR Street ILIKE '%TEST%' OR Street ILIKE '%UNKNOWN%'
   OR LEN(TRIM(Street)) < 5
```

**V10 — Same MID/CAID Different Names:**
```sql
SELECT a.* FROM ammf a
JOIN (
  SELECT AcquirerMerchantID, CAID
  FROM ammf
  GROUP BY AcquirerMerchantID, CAID
  HAVING COUNT(DISTINCT UPPER(TRIM(DBAName))) > 1
) g ON a.AcquirerMerchantID = g.AcquirerMerchantID AND a.CAID = g.CAID
```
