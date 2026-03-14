# AMMF Violation Rules (V1-V13)

## Overview

The violation checker runs 13 SQL-based compliance rules against the generated AMMF output (`ammf_output` table in DuckDB). Each rule returns a DataFrame of violating rows with a `violation_id` column.

All rules are implemented in `backend/rules/violation_rules.py`.

## Normalization Strategy

Two normalization approaches are used depending on the column type:

### Formal Identifiers (CAID, MID)
```sql
UPPER(REPLACE(CAST(col AS VARCHAR), ' ', ''))
```
- Case-insensitive comparison
- All internal spaces removed ("CAID 123" = "CAID123")
- No TRIM (TRIM was found to strip meaningful characters from identifiers)
- Rationale: Spaces within identifiers are data entry errors; case differences are not meaningful

### Free-Text Fields (names, addresses)
```sql
UPPER(TRIM(CAST(col AS VARCHAR)))
```
- Case-insensitive comparison
- Leading/trailing whitespace removed
- Internal spaces preserved (meaningful in names/addresses)

### Helper Function
```python
_NORM_ID = "UPPER(REPLACE(CAST({col} AS VARCHAR), ' ', ''))"

def _norm_id(col: str) -> str:
    return _NORM_ID.format(col=col)
```

## Rules Reference

### V1: Acquirer Name in Merchant Fields
| Property | Value |
|----------|-------|
| **ID** | V1 |
| **Name** | Acquirer Name in Merchant Fields |
| **Affected Columns** | DBAName, LegalName, BASEIIName |
| **Description** | Acquirer name is populated under the DBA name, legal name, or BASEIIName field |
| **Logic** | Exact match OR Jaro-Winkler similarity > 0.85 between acquirer name and merchant name fields |
| **Normalization** | LOWER(TRIM(...)) for all fields |
| **Remediation Strategy** | auto_fix (clear the copied value) |

### V2: Street and City Same
| Property | Value |
|----------|-------|
| **ID** | V2 |
| **Name** | Street and City Same |
| **Affected Columns** | Street, City |
| **Description** | Street and city details are the same string or variation |
| **Logic** | Exact match after normalization, or street with numbers stripped equals city (if city > 3 chars) |
| **Normalization** | LOWER(TRIM(...)) |
| **Remediation Strategy** | web_research (need real address data) |

### V3: Same MID/CAID/DBA Multiple Addresses
| Property | Value |
|----------|-------|
| **ID** | V3 |
| **Name** | Same MID/CAID/DBA Multiple Addresses |
| **Affected Columns** | AcquirerMerchantID, CAID, DBAName, Street, City |
| **Description** | Same MID, CAID, and DBA name but multiple different addresses |
| **Logic** | Group by normalized MID + CAID + DBA, flag groups with > 1 distinct address |
| **Normalization** | CAID/MID: `_norm_id()` (UPPER + space-compress); DBA/address: UPPER(TRIM(...)) |
| **Remediation Strategy** | manual_review (ambiguous which address is correct) |

### V4: Invalid Address
| Property | Value |
|----------|-------|
| **ID** | V4 |
| **Name** | Invalid Address |
| **Affected Columns** | Street, City |
| **Description** | Invalid address details (PO boxes, junk strings, test addresses) |
| **Logic** | Checks for: PO boxes, repeated characters, very short strings, placeholder values (xxx, na, n/a, none, null, tbd) |
| **Normalization** | LOWER(TRIM(...)) |
| **Remediation Strategy** | web_research (need real address from web) |

### V5: Invalid BASEIIName
| Property | Value |
|----------|-------|
| **ID** | V5 |
| **Name** | Invalid BASEIIName |
| **Affected Columns** | BASEIIName, AggregatorName |
| **Description** | Invalid BASEIIName for Payment Facilitator records |
| **Logic** | For records with AggregatorName present: BASEIIName is null/empty, or equals AcquirerName, DBAName, or LegalName |
| **Normalization** | LOWER(TRIM(CAST(...))) |
| **Remediation Strategy** | auto_fix (derive BASEIIName from AggregatorName + DBA) |

### V6: CIB/BID/BIN Copied
| Property | Value |
|----------|-------|
| **ID** | V6 |
| **Name** | CIB/BID/BIN Copied |
| **Affected Columns** | ProcessorBINCIB, AcquirerBID, AcquirerBIN |
| **Description** | CIB, BID, BIN numeric values are identical (should be distinct identifiers) |
| **Logic** | Any pair of (CIB, BID, BIN) has the same numeric value (excluding 0) |
| **Normalization** | TRY_CAST(... AS BIGINT) for numeric comparison |
| **Remediation Strategy** | manual_review (need acquirer input for correct values) |

### V7: Invalid CAID
| Property | Value |
|----------|-------|
| **ID** | V7 |
| **Name** | Invalid CAID |
| **Affected Columns** | CAID |
| **Description** | Invalid CAIDs (null, blank, special characters, too short/long) |
| **Logic** | NULL, empty, length < 3, length > 15, or all non-alphanumeric characters |
| **Normalization** | TRIM(CAST(...)) for length checks |
| **Remediation Strategy** | manual_review (CAID must come from acquirer) |

### V8: Same Address Different MIDs
| Property | Value |
|----------|-------|
| **ID** | V8 |
| **Name** | Same Address Different MIDs |
| **Affected Columns** | Street, City, PostalCode, AcquirerMerchantID |
| **Description** | Same normalized address maps to different MIDs |
| **Logic** | Group by normalized (Street, City, PostalCode), flag groups with > 1 distinct MID |
| **Normalization** | Address: UPPER(TRIM(...)); MID: `_norm_id()` (UPPER + space-compress) |
| **Remediation Strategy** | manual_review (ambiguous MID assignment) |

### V9: Invalid Business Registration ID
| Property | Value |
|----------|-------|
| **ID** | V9 |
| **Name** | Invalid Business Registration ID |
| **Affected Columns** | BusinessRegistrationID |
| **Description** | Invalid values in Tax ID / registration number field |
| **Logic** | Too short (< 3), placeholder values (0, NA, NONE, etc.), all non-alphanumeric, repeated single character |
| **Normalization** | TRIM(CAST(...)) and UPPER(TRIM(...)) |
| **Remediation Strategy** | web_research (look up real tax ID) |

### V10: Same MID/CAID Different Names
| Property | Value |
|----------|-------|
| **ID** | V10 |
| **Name** | Same MID/CAID Different Names |
| **Affected Columns** | AcquirerMerchantID, CAID, DBAName, LegalName |
| **Description** | Same MID and CAID but different DBA names or legal names |
| **Logic** | Group by normalized MID + CAID, flag groups with > 1 distinct DBA or legal name |
| **Normalization** | CAID/MID: `_norm_id()` (UPPER + space-compress); Names: UPPER(TRIM(...)) |
| **Remediation Strategy** | web_research (verify correct merchant name) |

### V11: Different MIDs Same CAID
| Property | Value |
|----------|-------|
| **ID** | V11 |
| **Name** | Different MIDs Same CAID |
| **Affected Columns** | AcquirerMerchantID, CAID |
| **Description** | Different MIDs sharing the same CAID (case-insensitive, space-compressed) |
| **Logic** | Group by normalized CAID, flag groups with > 1 distinct normalized MID. Excludes NULL/empty CAIDs. |
| **Normalization** | Both CAID and MID: `_norm_id()` (UPPER + space-compress) |
| **Remediation Strategy** | manual_review (MID/CAID relationship needs acquirer input) |
| **Note** | This was the subject of P1 debugging — TRIM was originally used but found to strip characters from identifiers, causing false positives. Fixed with UPPER + REPLACE spaces approach. |

### V12: BASEIIName Copied to DBA/Legal
| Property | Value |
|----------|-------|
| **ID** | V12 |
| **Name** | BASEIIName Copied to DBA/Legal |
| **Affected Columns** | BASEIIName, DBAName, LegalName |
| **Description** | BASEIIName is simply copied across DBA name and legal name fields |
| **Logic** | BASEIIName equals DBAName or LegalName (after normalization) |
| **Normalization** | LOWER(TRIM(CAST(...))) |
| **Remediation Strategy** | auto_fix (clear the copied BASEIIName) |

### V13: Sub-merchants Same Tax ID
| Property | Value |
|----------|-------|
| **ID** | V13 |
| **Name** | Sub-merchants Same Tax ID |
| **Affected Columns** | AggregatorID, BusinessRegistrationID |
| **Description** | All sub-merchants under an aggregator share the same Tax ID |
| **Logic** | Group by normalized AggregatorID; flag groups with exactly 1 distinct Tax ID but > 1 merchant |
| **Normalization** | UPPER(TRIM(CAST(...))) for both fields |
| **Remediation Strategy** | manual_review (Tax ID sharing needs acquirer input) |

## Rule Registry

All rules are registered in the `VIOLATION_RULES` list at the bottom of `violation_rules.py`:

```python
VIOLATION_RULES = [
    {"id": "V1",  "name": "...", "description": "...", "columns": [...], "func": check_v1_...},
    {"id": "V2",  ...},
    ...
    {"id": "V13", ...},
]
```

The violation checker agent iterates this list, runs each function, and aggregates results into a `ViolationReport`.

## Adding a New Rule

1. Add a function `check_v14_xxx(db: DuckDBEngine) -> pd.DataFrame` in `violation_rules.py`
2. Add an entry to `VIOLATION_RULES` list
3. Add a strategy entry in `remediation_agent.py` → `RULE_STRATEGIES`
4. The frontend will automatically show it in the violations table
