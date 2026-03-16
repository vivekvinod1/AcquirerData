export const PIPELINE_STEPS = [
  { key: "uploaded", label: "Upload", icon: "1" },
  { key: "ingestion", label: "Ingestion", icon: "2" },
  { key: "awaiting_approval", label: "Mapping Review", icon: "3" },
  { key: "relationships", label: "Relationships", icon: "4" },
  { key: "quality", label: "Data Quality", icon: "5" },
  { key: "query_generation", label: "Query Gen", icon: "6" },
  { key: "awaiting_sql_approval", label: "SQL Review", icon: "7" },
  { key: "executing", label: "Executing", icon: "8" },
  { key: "validation", label: "Validation", icon: "9" },
  { key: "complete", label: "Complete", icon: "✓" },
] as const;

export const VIOLATION_LABELS: Record<string, string> = {
  V1: "Acquirer Name in Merchant Fields",
  V2: "Street and City Same",
  V3: "Same MID/CAID/DBA, Multiple Addresses",
  V4: "Invalid Address",
  V5: "Invalid BASEIIName",
  V6: "CIB/BID/BIN Copied",
  V7: "Invalid CAID",
  V8: "Same Address, Different MIDs",
  V9: "Invalid Business Registration ID",
  V10: "Same MID/CAID, Different Names",
  V11: "Different MIDs, Same CAID",
  V12: "BASEIIName Copied to DBA/Legal",
  V13: "Sub-merchants Same Tax ID",
};

/** Violation rules unchecked by default in the selector */
export const DEFAULT_UNCHECKED_VIOLATIONS = new Set(["V5", "V11", "V12"]);
