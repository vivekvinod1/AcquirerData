"""13 AMMF Violation Rules implemented as DuckDB SQL queries."""

import pandas as pd
from core.db_engine import DuckDBEngine


def check_v1_acquirer_name_in_merchant_fields(db: DuckDBEngine) -> pd.DataFrame:
    """V1: Acquirer name copied into DBAName, LegalName, or BASEIIName."""
    return db.execute("""
        SELECT *, 'V1' AS violation_id,
            CASE
                WHEN LOWER(DBAName) = LOWER(AcquirerName) OR
                     jaro_winkler_similarity(LOWER(DBAName), LOWER(AcquirerName)) > 0.85
                    THEN 'DBAName'
                WHEN LOWER(LegalName) = LOWER(AcquirerName) OR
                     jaro_winkler_similarity(LOWER(LegalName), LOWER(AcquirerName)) > 0.85
                    THEN 'LegalName'
                WHEN BASEIIName IS NOT NULL AND (
                     LOWER(BASEIIName) = LOWER(AcquirerName) OR
                     jaro_winkler_similarity(LOWER(BASEIIName), LOWER(AcquirerName)) > 0.85)
                    THEN 'BASEIIName'
            END AS violated_column
        FROM ammf_output
        WHERE LOWER(DBAName) = LOWER(AcquirerName)
           OR jaro_winkler_similarity(LOWER(DBAName), LOWER(AcquirerName)) > 0.85
           OR LOWER(LegalName) = LOWER(AcquirerName)
           OR jaro_winkler_similarity(LOWER(LegalName), LOWER(AcquirerName)) > 0.85
           OR (BASEIIName IS NOT NULL AND (
               LOWER(BASEIIName) = LOWER(AcquirerName) OR
               jaro_winkler_similarity(LOWER(BASEIIName), LOWER(AcquirerName)) > 0.85))
    """)


def check_v2_street_city_same(db: DuckDBEngine) -> pd.DataFrame:
    """V2: Street and City details are the same."""
    return db.execute("""
        SELECT *, 'V2' AS violation_id
        FROM ammf_output
        WHERE LOWER(TRIM(Street)) = LOWER(TRIM(City))
           OR LOWER(TRIM(City)) = LOWER(TRIM(
               regexp_replace(Street, '[0-9,.]', '', 'g')))
           OR (LENGTH(City) > 3 AND POSITION(LOWER(City) IN LOWER(Street)) > 0
               AND LENGTH(Street) - LENGTH(City) < 5)
    """)


def check_v3_same_mid_caid_dba_multiple_addresses(db: DuckDBEngine) -> pd.DataFrame:
    """V3: Same MID + CAID + DBA name but multiple addresses."""
    return db.execute("""
        WITH grouped AS (
            SELECT AcquirerMerchantID, CAID, DBAName,
                   COUNT(DISTINCT CONCAT(Street, '|', City, '|', PostalCode)) AS addr_count
            FROM ammf_output
            GROUP BY AcquirerMerchantID, CAID, DBAName
            HAVING COUNT(DISTINCT CONCAT(Street, '|', City, '|', PostalCode)) > 1
        )
        SELECT a.*, 'V3' AS violation_id
        FROM ammf_output a
        JOIN grouped g ON a.AcquirerMerchantID = g.AcquirerMerchantID
            AND a.CAID = g.CAID AND a.DBAName = g.DBAName
    """)


def check_v4_invalid_addresses(db: DuckDBEngine) -> pd.DataFrame:
    """V4: Invalid address details (PO boxes, junk strings)."""
    return db.execute("""
        SELECT *, 'V4' AS violation_id
        FROM ammf_output
        WHERE LOWER(Street) LIKE '%p.o.%'
           OR LOWER(Street) LIKE '%po box%'
           OR LOWER(Street) LIKE '%p o box%'
           OR LENGTH(TRIM(Street)) < 5
           OR Street = REPEAT(SUBSTRING(Street, 1, 1), LENGTH(Street))
           OR LOWER(Street) LIKE '%test%address%'
           OR LOWER(Street) LIKE '%xxx%'
           OR LOWER(Street) = 'na'
           OR LOWER(Street) = 'n/a'
           OR LOWER(City) = 'na'
           OR LOWER(City) = 'n/a'
           OR LENGTH(TRIM(City)) < 2
    """)


def check_v5_invalid_baseii(db: DuckDBEngine) -> pd.DataFrame:
    """V5: Invalid BASEIIName for PF records or null for acquirer-sent PF records."""
    return db.execute("""
        SELECT *, 'V5' AS violation_id
        FROM ammf_output
        WHERE (AggregatorName IS NOT NULL AND (
            BASEIIName IS NULL
            OR TRIM(BASEIIName) = ''
            OR LOWER(BASEIIName) = LOWER(AcquirerName)
            OR LOWER(BASEIIName) = LOWER(DBAName)
            OR LOWER(BASEIIName) = LOWER(LegalName)
        ))
    """)


def check_v6_cib_bid_bin_copied(db: DuckDBEngine) -> pd.DataFrame:
    """V6: CIB, BID, BIN values copied across CAID."""
    return db.execute("""
        SELECT *, 'V6' AS violation_id
        FROM ammf_output
        WHERE CAST(ProcessorBINCIB AS VARCHAR) = CAST(AcquirerBID AS VARCHAR)
           OR CAST(ProcessorBINCIB AS VARCHAR) = CAST(AcquirerBIN AS VARCHAR)
           OR CAST(AcquirerBID AS VARCHAR) = CAST(AcquirerBIN AS VARCHAR)
           OR CAST(ProcessorBINCIB AS VARCHAR) = CAID
           OR CAST(AcquirerBID AS VARCHAR) = CAID
           OR CAST(AcquirerBIN AS VARCHAR) = CAID
    """)


def check_v7_invalid_caids(db: DuckDBEngine) -> pd.DataFrame:
    """V7: Invalid CAIDs (spaces, special chars, too short)."""
    return db.execute("""
        SELECT *, 'V7' AS violation_id
        FROM ammf_output
        WHERE CAID IS NULL
           OR LENGTH(TRIM(CAID)) < 3
           OR LENGTH(TRIM(CAID)) > 15
           OR regexp_matches(TRIM(CAID), '^[^a-zA-Z0-9]+$')
    """)


def check_v8_same_address_different_mids(db: DuckDBEngine) -> pd.DataFrame:
    """V8: Same address but different MIDs."""
    return db.execute("""
        WITH grouped AS (
            SELECT Street, City, PostalCode,
                   COUNT(DISTINCT AcquirerMerchantID) AS mid_count
            FROM ammf_output
            GROUP BY Street, City, PostalCode
            HAVING COUNT(DISTINCT AcquirerMerchantID) > 1
        )
        SELECT a.*, 'V8' AS violation_id
        FROM ammf_output a
        JOIN grouped g ON a.Street = g.Street AND a.City = g.City AND a.PostalCode = g.PostalCode
    """)


def check_v9_invalid_business_registration(db: DuckDBEngine) -> pd.DataFrame:
    """V9: Invalid Business Registration ID / Tax ID."""
    return db.execute("""
        SELECT *, 'V9' AS violation_id
        FROM ammf_output
        WHERE BusinessRegistrationID IS NOT NULL AND (
            LENGTH(TRIM(CAST(BusinessRegistrationID AS VARCHAR))) < 3
            OR TRIM(CAST(BusinessRegistrationID AS VARCHAR)) = '0'
            OR TRIM(CAST(BusinessRegistrationID AS VARCHAR)) = 'NA'
            OR TRIM(CAST(BusinessRegistrationID AS VARCHAR)) = 'N/A'
            OR regexp_matches(TRIM(CAST(BusinessRegistrationID AS VARCHAR)), '^[^a-zA-Z0-9]+$')
            OR CAST(BusinessRegistrationID AS VARCHAR) =
               REPEAT(SUBSTRING(CAST(BusinessRegistrationID AS VARCHAR), 1, 1),
                      LENGTH(CAST(BusinessRegistrationID AS VARCHAR)))
        )
    """)


def check_v10_same_mid_caid_different_names(db: DuckDBEngine) -> pd.DataFrame:
    """V10: Same MID + CAID but different DBA names or Legal names."""
    return db.execute("""
        WITH grouped AS (
            SELECT AcquirerMerchantID, CAID,
                   COUNT(DISTINCT DBAName) AS dba_count,
                   COUNT(DISTINCT LegalName) AS legal_count
            FROM ammf_output
            GROUP BY AcquirerMerchantID, CAID
            HAVING COUNT(DISTINCT DBAName) > 1 OR COUNT(DISTINCT LegalName) > 1
        )
        SELECT a.*, 'V10' AS violation_id
        FROM ammf_output a
        JOIN grouped g ON a.AcquirerMerchantID = g.AcquirerMerchantID AND a.CAID = g.CAID
    """)


def check_v11_different_mids_same_caid(db: DuckDBEngine) -> pd.DataFrame:
    """V11: Different MIDs but same CAID."""
    return db.execute("""
        WITH grouped AS (
            SELECT CAID,
                   COUNT(DISTINCT AcquirerMerchantID) AS mid_count
            FROM ammf_output
            GROUP BY CAID
            HAVING COUNT(DISTINCT AcquirerMerchantID) > 1
        )
        SELECT a.*, 'V11' AS violation_id
        FROM ammf_output a
        JOIN grouped g ON a.CAID = g.CAID
    """)


def check_v12_baseii_copied_to_dba_legal(db: DuckDBEngine) -> pd.DataFrame:
    """V12: BASEIIName simply copied across DBAName and LegalName."""
    return db.execute("""
        SELECT *, 'V12' AS violation_id
        FROM ammf_output
        WHERE BASEIIName IS NOT NULL AND (
            LOWER(TRIM(BASEIIName)) = LOWER(TRIM(DBAName))
            OR LOWER(TRIM(BASEIIName)) = LOWER(TRIM(LegalName))
        )
    """)


def check_v13_submerchants_same_taxid(db: DuckDBEngine) -> pd.DataFrame:
    """V13: All sub-merchants under an aggregator share the same Tax ID."""
    return db.execute("""
        WITH agg_tax AS (
            SELECT AggregatorID,
                   COUNT(DISTINCT BusinessRegistrationID) AS tax_count,
                   COUNT(*) AS merchant_count
            FROM ammf_output
            WHERE AggregatorID IS NOT NULL
              AND BusinessRegistrationID IS NOT NULL
            GROUP BY AggregatorID
            HAVING COUNT(DISTINCT BusinessRegistrationID) = 1
               AND COUNT(*) > 1
        )
        SELECT a.*, 'V13' AS violation_id
        FROM ammf_output a
        JOIN agg_tax t ON a.AggregatorID = t.AggregatorID
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
     "description": "CIB, BID, BIN values copied across CAID",
     "columns": ["ProcessorBINCIB", "AcquirerBID", "AcquirerBIN", "CAID"],
     "func": check_v6_cib_bid_bin_copied},
    {"id": "V7", "name": "Invalid CAID",
     "description": "Invalid CAIDs (spaces, special characters, too short/long)",
     "columns": ["CAID"],
     "func": check_v7_invalid_caids},
    {"id": "V8", "name": "Same Address Different MIDs",
     "description": "Same address but different MIDs assigned",
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
     "description": "Different MIDs but same CAID",
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
