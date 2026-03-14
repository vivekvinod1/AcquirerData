"""AMMF 31-column specification with field metadata."""

AMMF_COLUMNS = [
    {"name": "ProcessorBINCIB", "type": "integer", "required": True, "description": "The processor number (CIB)"},
    {"name": "ProcessorName", "type": "string", "required": True, "description": "The name of the processor (CIB)"},
    {"name": "LocationCountry", "type": "integer", "required": True, "description": "Merchant Location country (ISO code, e.g. 356 for India)"},
    {"name": "AcquirerBID", "type": "integer", "required": True, "description": "Business Identification Number of acquiring institution"},
    {"name": "AcquirerName", "type": "string", "required": True, "description": "Name of the acquiring financial institution"},
    {"name": "AcquirerMerchantID", "type": "string", "required": True, "description": "Unique ID for a merchant at a location. SubMerchantID for PF, AcquirerAssignedMerchantID for direct"},
    {"name": "AcquirerBIN", "type": "integer", "required": True, "description": "Visa-assigned Acquiring Identifier (BIN)"},
    {"name": "AggregatorID", "type": "string", "required": "submerchant", "description": "Payment Facilitator/Marketplace ID assigned by Visa"},
    {"name": "AggregatorName", "type": "string", "required": "submerchant", "description": "Name of the aggregator processing sub-merchant payments"},
    {"name": "AggregatorType", "type": "string", "required": "submerchant", "description": "Type: payment facilitator (p) or marketplace (m)"},
    {"name": "CAID", "type": "string", "required": True, "description": "Card Acceptor ID matching VisaNet Settlement Data"},
    {"name": "DBAName", "type": "string", "required": True, "description": "Doing Business As name (consumer-facing merchant name)"},
    {"name": "LegalName", "type": "string", "required": True, "description": "Legal business name of the merchant"},
    {"name": "CorporateStatus", "type": "integer", "required": True, "description": "Corporate status (0=Not Sole Proprietor, 1=Sole Proprietor, etc.)"},
    {"name": "CorporateName", "type": "string", "required": False, "description": "Name of owning corporation"},
    {"name": "DateSigned", "type": "date", "required": True, "description": "Relationship start date (ccyymmdd format)"},
    {"name": "BASEIIName", "type": "string", "required": "submerchant", "description": "Merchant name from transactions. Required for PF records"},
    {"name": "Street", "type": "string", "required": True, "description": "Physical location street address (no PO boxes)"},
    {"name": "City", "type": "string", "required": True, "description": "Physical location city"},
    {"name": "StateProvinceCode", "type": "string", "required": False, "description": "State/province code or name"},
    {"name": "PostalCode", "type": "string", "required": True, "description": "Physical location postal/zip code"},
    {"name": "MCC1", "type": "integer", "required": True, "description": "Primary Merchant Category Code"},
    {"name": "MCC2", "type": "integer", "required": False, "description": "Secondary MCC"},
    {"name": "MCC3", "type": "integer", "required": False, "description": "Additional MCC"},
    {"name": "MCC4", "type": "integer", "required": False, "description": "Additional MCC"},
    {"name": "MCC5", "type": "integer", "required": False, "description": "Additional MCC"},
    {"name": "MCC6", "type": "integer", "required": False, "description": "Additional MCC"},
    {"name": "MCC7", "type": "integer", "required": False, "description": "Additional MCC"},
    {"name": "MCC8", "type": "integer", "required": False, "description": "Additional MCC"},
    {"name": "MCC9", "type": "integer", "required": False, "description": "Additional MCC"},
    {"name": "BusinessRegistrationID", "type": "string", "required": False, "description": "Tax ID / government-assigned registration number"},
]

AMMF_COLUMN_NAMES = [col["name"] for col in AMMF_COLUMNS]

REQUIRED_COLUMNS = [col["name"] for col in AMMF_COLUMNS if col["required"] is True]

SUBMERCHANT_REQUIRED = [col["name"] for col in AMMF_COLUMNS if col["required"] == "submerchant"]

OPTIONAL_COLUMNS = [col["name"] for col in AMMF_COLUMNS if col["required"] is False]


def get_ammf_spec_for_prompt() -> str:
    """Format the AMMF spec for inclusion in LLM prompts."""
    lines = ["AMMF Output Columns (31 total):"]
    for col in AMMF_COLUMNS:
        req = "REQUIRED" if col["required"] is True else (
            "REQUIRED for sub-merchants" if col["required"] == "submerchant" else "Optional"
        )
        lines.append(f"  - {col['name']} ({col['type']}, {req}): {col['description']}")
    return "\n".join(lines)
