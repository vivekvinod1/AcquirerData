"""13 AMMF Violation Rules implemented as DuckDB SQL queries.

CAID and MID are formal identifiers — we normalize with UPPER + REPLACE spaces
(case-insensitive, space-compressed) so "caid 123" and "CAID123" match correctly.
Free-text fields (names, addresses) use UPPER+TRIM normalization.
"""

# Helper: normalize a formal identifier (CAID, MID) — upper-case and remove all spaces
_NORM_ID = "UPPER(REPLACE(CAST({col} AS VARCHAR), ' ', ''))"


def _norm_id(col: str) -> str:
    """Return SQL expression to normalize a formal identifier column."""
    return _NORM_ID.format(col=col)

import pandas as pd
from core.db_engine import DuckDBEngine


def check_v1_acquirer_name_in_merchant_fields(db: DuckDBEngine) -> pd.DataFrame:
    """V1: Acquirer name copied into DBAName, LegalName, or BASEIIName."""
    return db.execute("""
        SELECT *, 'V1' AS violation_id,
            CASE
                WHEN LOWER(TRIM(DBAName)) = LOWER(TRIM(AcquirerName)) OR
                     jaro_winkler_similarity(LOWER(TRIM(DBAName)), LOWER(TRIM(AcquirerName))) > 0.85
                    THEN 'DBAName'
                WHEN LOWER(TRIM(LegalName)) = LOWER(TRIM(AcquirerName)) OR
                     jaro_winkler_similarity(LOWER(TRIM(LegalName)), LOWER(TRIM(AcquirerName))) > 0.85
                    THEN 'LegalName'
                WHEN BASEIIName IS NOT NULL AND (
                     LOWER(TRIM(BASEIIName)) = LOWER(TRIM(AcquirerName)) OR
                     jaro_winkler_similarity(LOWER(TRIM(BASEIIName)), LOWER(TRIM(AcquirerName))) > 0.85)
                    THEN 'BASEIIName'
            END AS violated_column
        FROM ammf_output
        WHERE LOWER(TRIM(DBAName)) = LOWER(TRIM(AcquirerName))
           OR jaro_winkler_similarity(LOWER(TRIM(DBAName)), LOWER(TRIM(AcquirerName))) > 0.85
           OR LOWER(TRIM(LegalName)) = LOWER(TRIM(AcquirerName))
           OR jaro_winkler_similarity(LOWER(TRIM(LegalName)), LOWER(TRIM(AcquirerName))) > 0.85
           OR (BASEIIName IS NOT NULL AND (
               LOWER(TRIM(BASEIIName)) = LOWER(TRIM(AcquirerName)) OR
               jaro_winkler_similarity(LOWER(TRIM(BASEIIName)), LOWER(TRIM(AcquirerName))) > 0.85))
    """)


def check_v2_street_city_same(db: DuckDBEngine) -> pd.DataFrame:
    """V2: Street and City details are the same."""
    return db.execute("""
        SELECT *, 'V2' AS violation_id
        FROM ammf_output
        WHERE LOWER(TRIM(Street)) = LOWER(TRIM(City))
           OR (LENGTH(TRIM(City)) > 3
               AND LOWER(TRIM(regexp_replace(Street, '[0-9,.\-#]', '', 'g'))) = LOWER(TRIM(City))
               AND LENGTH(TRIM(regexp_replace(Street, '[0-9,.\-#]', '', 'g'))) > 3)
    """)


def check_v3_same_mid_caid_dba_multiple_addresses(db: DuckDBEngine) -> pd.DataFrame:
    """V3: Same MID + CAID + DBA name but multiple addresses.
    CAID and MID use UPPER + space-compress. DBA and address use UPPER+TRIM."""
    return db.execute(f"""
        WITH normalized AS (
            SELECT *,
                {_norm_id('CAID')} AS _n_caid,
                {_norm_id('AcquirerMerchantID')} AS _n_mid,
                UPPER(TRIM(CAST(DBAName AS VARCHAR))) AS _n_dba,
                UPPER(TRIM(CAST(Street AS VARCHAR))) || '|' ||
                    UPPER(TRIM(CAST(City AS VARCHAR))) || '|' ||
                    UPPER(TRIM(CAST(PostalCode AS VARCHAR))) AS _addr
            FROM ammf_output
        ),
        grouped AS (
            SELECT _n_mid, _n_caid, _n_dba,
                   COUNT(DISTINCT _addr) AS addr_count
            FROM normalized
            WHERE _n_caid IS NOT NULL AND _n_caid != ''
            GROUP BY _n_mid, _n_caid, _n_dba
            HAVING COUNT(DISTINCT _addr) > 1
        )
        SELECT a.*, 'V3' AS violation_id
        FROM normalized a
        JOIN grouped g ON a._n_mid = g._n_mid
            AND a._n_caid = g._n_caid AND a._n_dba = g._n_dba
    """)


def check_v4_invalid_addresses(db: DuckDBEngine) -> pd.DataFrame:
    """V4: Invalid address details (PO boxes, junk strings)."""
    return db.execute("""
        SELECT *, 'V4' AS violation_id
        FROM ammf_output
        WHERE LOWER(TRIM(Street)) LIKE '%p.o.%'
           OR LOWER(TRIM(Street)) LIKE '%po box%'
           OR LOWER(TRIM(Street)) LIKE '%p o box%'
           OR LENGTH(TRIM(Street)) < 5
           OR (LENGTH(TRIM(Street)) > 1 AND
               TRIM(Street) = REPEAT(SUBSTRING(TRIM(Street), 1, 1), LENGTH(TRIM(Street))))
           OR LOWER(TRIM(Street)) LIKE '%test%address%'
           OR LOWER(TRIM(Street)) IN ('xxx', 'xxxx', 'xxxxx', 'na', 'n/a', 'none', 'null', 'tbd', '.')
           OR LOWER(TRIM(City)) IN ('na', 'n/a', 'none', 'null', 'tbd', '.')
           OR LENGTH(TRIM(City)) < 2
    """)


def check_v5_invalid_baseii(db: DuckDBEngine) -> pd.DataFrame:
    """V5: Invalid BASEIIName for PF records or null for acquirer-sent PF records."""
    return db.execute("""
        SELECT *, 'V5' AS violation_id
        FROM ammf_output
        WHERE (AggregatorName IS NOT NULL AND TRIM(CAST(AggregatorName AS VARCHAR)) != '' AND (
            BASEIIName IS NULL
            OR TRIM(CAST(BASEIIName AS VARCHAR)) = ''
            OR LOWER(TRIM(CAST(BASEIIName AS VARCHAR))) = LOWER(TRIM(CAST(AcquirerName AS VARCHAR)))
            OR LOWER(TRIM(CAST(BASEIIName AS VARCHAR))) = LOWER(TRIM(CAST(DBAName AS VARCHAR)))
            OR LOWER(TRIM(CAST(BASEIIName AS VARCHAR))) = LOWER(TRIM(CAST(LegalName AS VARCHAR)))
        ))
    """)


def check_v6_cib_bid_bin_copied(db: DuckDBEngine) -> pd.DataFrame:
    """V6: CIB, BID, BIN numeric identifiers are equal to each other (should be distinct).
    Only flags when all three are supposed to be different.
    Compares numeric values, not string representations to avoid type mismatch false positives.
    Does NOT compare against CAID (different identifier type)."""
    return db.execute("""
        SELECT *, 'V6' AS violation_id
        FROM ammf_output
        WHERE (TRY_CAST(ProcessorBINCIB AS BIGINT) IS NOT NULL
               AND TRY_CAST(AcquirerBID AS BIGINT) IS NOT NULL
               AND TRY_CAST(ProcessorBINCIB AS BIGINT) = TRY_CAST(AcquirerBID AS BIGINT)
               AND TRY_CAST(ProcessorBINCIB AS BIGINT) != 0)
           OR (TRY_CAST(ProcessorBINCIB AS BIGINT) IS NOT NULL
               AND TRY_CAST(AcquirerBIN AS BIGINT) IS NOT NULL
               AND TRY_CAST(ProcessorBINCIB AS BIGINT) = TRY_CAST(AcquirerBIN AS BIGINT)
               AND TRY_CAST(ProcessorBINCIB AS BIGINT) != 0)
           OR (TRY_CAST(AcquirerBID AS BIGINT) IS NOT NULL
               AND TRY_CAST(AcquirerBIN AS BIGINT) IS NOT NULL
               AND TRY_CAST(AcquirerBID AS BIGINT) = TRY_CAST(AcquirerBIN AS BIGINT)
               AND TRY_CAST(AcquirerBID AS BIGINT) != 0)
    """)


def check_v7_invalid_caids(db: DuckDBEngine) -> pd.DataFrame:
    """V7: Invalid CAIDs (null, too short, too long, non-alphanumeric only)."""
    return db.execute("""
        SELECT *, 'V7' AS violation_id
        FROM ammf_output
        WHERE CAID IS NULL
           OR TRIM(CAST(CAID AS VARCHAR)) = ''
           OR LENGTH(TRIM(CAST(CAID AS VARCHAR))) < 3
           OR LENGTH(TRIM(CAST(CAID AS VARCHAR))) > 15
           OR regexp_matches(TRIM(CAST(CAID AS VARCHAR)), '^[^a-zA-Z0-9]+$')
    """)


def check_v8_same_address_different_mids(db: DuckDBEngine) -> pd.DataFrame:
    """V8: Same normalized address maps to different MIDs.
    Address uses UPPER+TRIM (free-text). MID uses UPPER + space-compress."""
    return db.execute(f"""
        WITH normalized AS (
            SELECT *,
                UPPER(TRIM(CAST(Street AS VARCHAR))) AS _n_street,
                UPPER(TRIM(CAST(City AS VARCHAR))) AS _n_city,
                UPPER(TRIM(CAST(PostalCode AS VARCHAR))) AS _n_postal,
                {_norm_id('AcquirerMerchantID')} AS _n_mid
            FROM ammf_output
            WHERE TRIM(CAST(Street AS VARCHAR)) != ''
              AND TRIM(CAST(City AS VARCHAR)) != ''
              AND TRIM(CAST(PostalCode AS VARCHAR)) != ''
        ),
        grouped AS (
            SELECT _n_street, _n_city, _n_postal,
                   COUNT(DISTINCT _n_mid) AS mid_count
            FROM normalized
            GROUP BY _n_street, _n_city, _n_postal
            HAVING COUNT(DISTINCT _n_mid) > 1
        )
        SELECT a.*, 'V8' AS violation_id
        FROM normalized a
        JOIN grouped g ON a._n_street = g._n_street
            AND a._n_city = g._n_city AND a._n_postal = g._n_postal
    """)


def check_v9_invalid_business_registration(db: DuckDBEngine) -> pd.DataFrame:
    """V9: Invalid Business Registration ID / Tax ID."""
    return db.execute("""
        SELECT *, 'V9' AS violation_id
        FROM ammf_output
        WHERE BusinessRegistrationID IS NOT NULL
          AND TRIM(CAST(BusinessRegistrationID AS VARCHAR)) != ''
          AND (
            LENGTH(TRIM(CAST(BusinessRegistrationID AS VARCHAR))) < 3
            OR UPPER(TRIM(CAST(BusinessRegistrationID AS VARCHAR))) IN ('0', '00', '000', 'NA', 'N/A', 'NONE', 'NULL', 'TBD')
            OR regexp_matches(TRIM(CAST(BusinessRegistrationID AS VARCHAR)), '^[^a-zA-Z0-9]+$')
            OR (LENGTH(TRIM(CAST(BusinessRegistrationID AS VARCHAR))) > 1
                AND TRIM(CAST(BusinessRegistrationID AS VARCHAR)) =
                   REPEAT(SUBSTRING(TRIM(CAST(BusinessRegistrationID AS VARCHAR)), 1, 1),
                          LENGTH(TRIM(CAST(BusinessRegistrationID AS VARCHAR)))))
        )
    """)


def check_v10_same_mid_caid_different_names(db: DuckDBEngine) -> pd.DataFrame:
    """V10: Same MID + CAID but different DBA names or Legal names.
    CAID and MID use UPPER + space-compress. Names use UPPER+TRIM."""
    return db.execute(f"""
        WITH normalized AS (
            SELECT *,
                {_norm_id('CAID')} AS _n_caid,
                {_norm_id('AcquirerMerchantID')} AS _n_mid,
                UPPER(TRIM(CAST(DBAName AS VARCHAR))) AS _n_dba,
                UPPER(TRIM(CAST(LegalName AS VARCHAR))) AS _n_legal
            FROM ammf_output
            WHERE {_norm_id('CAID')} IS NOT NULL AND {_norm_id('CAID')} != ''
        ),
        grouped AS (
            SELECT _n_mid, _n_caid,
                   COUNT(DISTINCT _n_dba) AS dba_count,
                   COUNT(DISTINCT _n_legal) AS legal_count
            FROM normalized
            GROUP BY _n_mid, _n_caid
            HAVING COUNT(DISTINCT _n_dba) > 1 OR COUNT(DISTINCT _n_legal) > 1
        )
        SELECT a.*, 'V10' AS violation_id
        FROM normalized a
        JOIN grouped g ON a._n_mid = g._n_mid AND a._n_caid = g._n_caid
    """)


def check_v11_different_mids_same_caid(db: DuckDBEngine) -> pd.DataFrame:
    """V11: Different MIDs sharing the same CAID.
    CAID and MID use UPPER + space-compress. Excludes NULL/empty CAIDs."""
    return db.execute(f"""
        WITH normalized AS (
            SELECT *,
                {_norm_id('CAID')} AS _n_caid,
                {_norm_id('AcquirerMerchantID')} AS _n_mid
            FROM ammf_output
            WHERE CAID IS NOT NULL
              AND {_norm_id('CAID')} != ''
        ),
        grouped AS (
            SELECT _n_caid,
                   COUNT(DISTINCT _n_mid) AS mid_count
            FROM normalized
            GROUP BY _n_caid
            HAVING COUNT(DISTINCT _n_mid) > 1
        )
        SELECT a.*, 'V11' AS violation_id
        FROM normalized a
        JOIN grouped g ON a._n_caid = g._n_caid
    """)


def check_v12_baseii_copied_to_dba_legal(db: DuckDBEngine) -> pd.DataFrame:
    """V12: BASEIIName simply copied across DBAName and LegalName."""
    return db.execute("""
        SELECT *, 'V12' AS violation_id
        FROM ammf_output
        WHERE BASEIIName IS NOT NULL
          AND TRIM(CAST(BASEIIName AS VARCHAR)) != ''
          AND (
            LOWER(TRIM(CAST(BASEIIName AS VARCHAR))) = LOWER(TRIM(CAST(DBAName AS VARCHAR)))
            OR LOWER(TRIM(CAST(BASEIIName AS VARCHAR))) = LOWER(TRIM(CAST(LegalName AS VARCHAR)))
        )
    """)


def check_v13_submerchants_same_taxid(db: DuckDBEngine) -> pd.DataFrame:
    """V13: All sub-merchants under an aggregator share the same Tax ID."""
    return db.execute("""
        WITH agg_tax AS (
            SELECT UPPER(TRIM(CAST(AggregatorID AS VARCHAR))) AS _n_agg,
                   COUNT(DISTINCT UPPER(TRIM(CAST(BusinessRegistrationID AS VARCHAR)))) AS tax_count,
                   COUNT(*) AS merchant_count
            FROM ammf_output
            WHERE AggregatorID IS NOT NULL
              AND TRIM(CAST(AggregatorID AS VARCHAR)) != ''
              AND BusinessRegistrationID IS NOT NULL
              AND TRIM(CAST(BusinessRegistrationID AS VARCHAR)) != ''
            GROUP BY UPPER(TRIM(CAST(AggregatorID AS VARCHAR)))
            HAVING COUNT(DISTINCT UPPER(TRIM(CAST(BusinessRegistrationID AS VARCHAR)))) = 1
               AND COUNT(*) > 1
        )
        SELECT a.*, 'V13' AS violation_id
        FROM ammf_output a
        JOIN agg_tax t ON UPPER(TRIM(CAST(a.AggregatorID AS VARCHAR))) = t._n_agg
    """)


# Registry of all violation checks
VIOLATION_RULES = [
    {"id": "V1", "name": "Acquirer Name in Merchant Fields",
     "description": "Acquirer name is populated under the DBA name, legal name or BASEIIName field",
     "columns": ["DBAName", "LegalName", "BASEIIName"],
     "func": check_v1_acquirer_name_in_merchant_fields},
    {"id": "V2", "name": "Street and City Same",
     "description": "Street and city details are the same string or variation",
     "columns": ["Street", "City"],
     "func": check_v2_street_city_same},
    {"id": "V3", "name": "Same MID/CAID/DBA Multiple Addresses",
     "description": "Same MID, CAID, DBA name but multiple addresses reported",
     "columns": ["AcquirerMerchantID", "CAID", "DBAName", "Street", "City"],
     "func": check_v3_same_mid_caid_dba_multiple_addresses},
    {"id": "V4", "name": "Invalid Address",
     "description": "Invalid address details (fake addresses, PO boxes, junk strings)",
     "columns": ["Street", "City"],
     "func": check_v4_invalid_addresses},
    {"id": "V5", "name": "Invalid BASEIIName",
     "description": "Invalid BASEIIName for PF records or null for acquirer-sent PF records",
     "columns": ["BASEIIName", "AggregatorName"],
     "func": check_v5_invalid_baseii},
    {"id": "V6", "name": "CIB/BID/BIN Copied",
     "description": "CIB, BID, BIN numeric values are identical (should be distinct identifiers)",
     "columns": ["ProcessorBINCIB", "AcquirerBID", "AcquirerBIN"],
     "func": check_v6_cib_bid_bin_copied},
    {"id": "V7", "name": "Invalid CAID",
     "description": "Invalid CAIDs (null, blank, special characters, too short/long)",
     "columns": ["CAID"],
     "func": check_v7_invalid_caids},
    {"id": "V8", "name": "Same Address Different MIDs",
     "description": "Same normalized address but different MIDs assigned",
     "columns": ["Street", "City", "PostalCode", "AcquirerMerchantID"],
     "func": check_v8_same_address_different_mids},
    {"id": "V9", "name": "Invalid Business Registration ID",
     "description": "Invalid values in BusinessRegistrationID/Tax ID field",
     "columns": ["BusinessRegistrationID"],
     "func": check_v9_invalid_business_registration},
    {"id": "V10", "name": "Same MID/CAID Different Names",
     "description": "Same MID and CAID but different DBA names or legal names",
     "columns": ["AcquirerMerchantID", "CAID", "DBAName", "LegalName"],
     "func": check_v10_same_mid_caid_different_names},
    {"id": "V11", "name": "Different MIDs Same CAID",
     "description": "Different MIDs but same CAID (case-insensitive, space-compressed)",
     "columns": ["AcquirerMerchantID", "CAID"],
     "func": check_v11_different_mids_same_caid},
    {"id": "V12", "name": "BASEIIName Copied to DBA/Legal",
     "description": "BASEIIName is simply copied across DBA name and legal name fields",
     "columns": ["BASEIIName", "DBAName", "LegalName"],
     "func": check_v12_baseii_copied_to_dba_legal},
    {"id": "V13", "name": "Sub-merchants Same Tax ID",
     "description": "All sub-merchants under an aggregator assigned the same Tax ID",
     "columns": ["AggregatorID", "BusinessRegistrationID"],
     "func": check_v13_submerchants_same_taxid},
]
