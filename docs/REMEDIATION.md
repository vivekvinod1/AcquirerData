# Auto-Remediation Engine

## Overview

The remediation engine provides AI-driven fix proposals for AMMF violations. It combines three strategies: deterministic auto-fixes, web research for external data, and manual review guidance. Users always have the final say — fixes are proposed, never applied silently.

## Architecture

```
Violation Table (Frontend)
    │
    ├── [Fix] button per rule
    │       │
    │       ▼
    │   RemediationPanel
    │   ├── Generate Plan (POST /remediation/plan)
    │   │       │
    │   │       ▼
    │   │   Remediation Agent (backend)
    │   │   ├── Determine strategy (auto_fix / web_research / manual_review)
    │   │   ├── Fetch affected rows from AMMF output
    │   │   ├── Generate fix proposals with old → new values
    │   │   └── Return RemediationPlan
    │   │
    │   ├── Fix list with checkboxes
    │   │   ├── [Apply Selected] → POST /remediation/apply
    │   │   └── [Re-verify] → POST /remediation/re-verify
    │   │
    │   └── [Web Research] button per merchant
    │           │
    │           ▼
    │       WebResearchModal
    │       ├── POST /remediation/research
    │       │       │
    │       │       ▼
    │       │   Web Research Agent (backend)
    │       │   ├── Generate search queries with Claude
    │       │   ├── Execute Brave Search API
    │       │   ├── Analyze results with Claude
    │       │   └── Return WebResearchResult
    │       │
    │       ├── Show findings + suggested fixes
    │       ├── [Accept] → POST /remediation/apply-web-fix
    │       └── [Decline] → dismiss
    │
    └── Before/After violation delta
```

## Remediation Strategies

Each violation rule has a default strategy that determines how fixes are generated:

| Strategy | Rules | Description |
|----------|-------|-------------|
| `auto_fix` | V1, V5, V12 | Deterministic corrections — the agent can compute the fix directly |
| `web_research` | V2, V4, V9, V10 | Needs external data — triggers web research for merchant info |
| `manual_review` | V3, V6, V7, V8, V11, V13 | Ambiguous — presents analysis but needs human decision |

### auto_fix Examples
- **V1** (Acquirer Name in Merchant Fields): Replace DBAName/LegalName with a placeholder or flag for correction
- **V5** (Invalid BASEIIName): Derive from "AggregatorName - DBAName" pattern
- **V12** (BASEIIName Copied): Clear the duplicated BASEIIName

### web_research Examples
- **V2** (Street = City): Look up merchant's real address online
- **V4** (Invalid Address): Find real address from business directories
- **V9** (Invalid Tax ID): Look up correct business registration number
- **V10** (Different Names Same MID): Verify the correct business name

### manual_review Examples
- **V3** (Multiple Addresses): Which address is the real location?
- **V6** (CIB/BID/BIN Copied): Need acquirer's reference data
- **V11** (Different MIDs Same CAID): Is this intentional or an error?

## Data Models

### RemediationFix
```python
class RemediationFix(BaseModel):
    row_indices: list[int]    # Which rows in the AMMF DataFrame to modify
    column: str               # Which AMMF column to change
    old_value: str | None     # Current value
    new_value: str | None     # Proposed new value
    reasoning: str            # Why this fix is proposed
    confidence: float         # 0.0 - 1.0
    strategy: RemediationStrategy
    needs_confirmation: bool  # Always True — user must approve
```

### RemediationPlan
```python
class RemediationPlan(BaseModel):
    rule_id: str
    rule_name: str
    total_affected: int
    fixes: list[RemediationFix]
    summary: str              # Human-readable summary of the plan
    strategy: RemediationStrategy
```

### WebResearchResult
```python
class WebResearchResult(BaseModel):
    merchant_name: str
    query: str
    findings: list[dict]       # [{source, title, snippet, relevance}]
    suggested_fixes: list[dict] # [{column, value, reasoning}]
    raw_analysis: str           # Full LLM analysis text
    search_queries_used: list[str]
```

### RemediationApplyResult
```python
class RemediationApplyResult(BaseModel):
    rows_modified: int
    new_violation_count: int
    previous_violation_count: int
    delta: int                # Negative = improvement
```

## API Endpoints

### Generate Remediation Plan
```
POST /remediation/plan
Body: { job_id, rule_id }
Response: RemediationPlan
```

### Apply Selected Fixes
```
POST /remediation/apply
Body: { job_id, rule_id, fix_indices: [0, 1, 3] }
Response: RemediationApplyResult
```
Applies the selected fixes from a previously generated plan. Modifies the in-memory AMMF DataFrame.

### Web Research
```
POST /remediation/research
Body: { job_id, merchant_name, violation_context, user_objective?, affected_columns? }
Response: WebResearchResult
```
Performs agentic web research for a specific merchant. The `user_objective` field allows users to guide what they want to find.

### Apply Web Research Fix
```
POST /remediation/apply-web-fix
Body: { job_id, row_index, fixes: [{column, value}] }
Response: { success: true, rows_modified: 1 }
```
Applies a fix from web research that the user accepted.

### Re-verify After Fixes
```
POST /remediation/re-verify
Body: { job_id }
Response: ViolationReport (updated)
```
Re-runs all 13 violation rules against the modified AMMF data to show before/after improvement.

## Web Research Agent Details

### Search Query Generation
Claude generates 2-3 targeted search queries based on:
- Merchant name
- Violation context (e.g., "invalid address", "mismatched business name")
- User objective (e.g., "find the real street address")

### Search Execution
1. **Primary**: Brave Search API (free tier: 2,000 queries/month)
2. **Fallback**: Claude's training data for well-known merchants

### Result Analysis
Claude analyzes search results and extracts:
- Relevant findings with source attribution
- Suggested column fixes with reasoning
- Confidence level for each suggestion

### User Interaction
Results are presented in a modal with:
- Search queries used
- Findings with sources
- Suggested fixes (column → proposed value → reasoning)
- Accept / Decline buttons per fix

## Apply and Re-verify Flow

```
1. User clicks [Fix] on a violation rule
2. Frontend calls POST /remediation/plan
3. Agent returns fix proposals
4. User reviews, selects fixes to apply
5. Frontend calls POST /remediation/apply
6. Backend modifies AMMF DataFrame in memory
7. User clicks [Re-verify]
8. Frontend calls POST /remediation/re-verify
9. Backend re-runs all 13 rules
10. Frontend shows before/after violation counts
```

The AMMF download endpoint always reflects the latest state of the DataFrame, so downloading after remediation gives the corrected file.

## Frontend Components

### RemediationPanel (`components/RemediationPanel.tsx`)
- Expandable panel within each violation row
- Shows fix proposals with old → new values
- Checkboxes for selective application
- "Apply Selected" and "Re-verify" buttons
- Displays before/after violation delta

### WebResearchModal (`components/WebResearchModal.tsx`)
- Modal overlay triggered from remediation panel
- Input field for user objective/context
- Displays search results with sources
- Accept/decline buttons per suggested fix
- Loading states during research

## Adding Remediation for New Rules

1. Add the rule's strategy to `RULE_STRATEGIES` in `remediation_agent.py`
2. If the strategy is `auto_fix`, implement the fix logic in the agent
3. If `web_research`, the existing web research flow works automatically
4. If `manual_review`, the agent generates analysis but marks `needs_confirmation: True`
