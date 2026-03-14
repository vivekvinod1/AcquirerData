export interface FileInfo {
  name: string;
  sheets: string[];
  row_counts: Record<string, number>;
  column_counts: Record<string, number>;
}

export interface UploadResponse {
  job_id: string;
  files: FileInfo[];
}

export interface PipelineStatus {
  job_id: string;
  step: string;
  progress_pct: number;
  messages: string[];
  started_at: string | null;
  completed_at: string | null;
}

export interface ColumnMapping {
  ammf_column: string;
  source_table: string | null;
  source_column: string | null;
  confidence: number;
  reasoning: string;
  is_derived: boolean;
  derivation_logic: string;
}

export interface SchemaMapping {
  mappings: ColumnMapping[];
  unmapped_required: string[];
  unmapped_optional: string[];
}

export interface ColumnQuality {
  column: string;
  null_count: number;
  null_pct: number;
  distinct_count: number;
  data_type: string;
  sample_values: string[];
  issues: string[];
}

export interface TableQuality {
  table_name: string;
  row_count: number;
  columns: ColumnQuality[];
  overall_score: number;
}

export interface QualityReport {
  tables: TableQuality[];
}

export interface ViolationRecord {
  rule_id: string;
  rule_name: string;
  description: string;
  affected_columns: string[];
  count: number;        // total affected rows
  group_count: number;  // distinct violation groups (for group-based rules)
  sample_rows: Record<string, unknown>[];
}

export interface ViolationReport {
  violations: ViolationRecord[];
  total_violations: number;
  total_rows_affected: number;
}

export interface AMMFPreview {
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  page_size: number;
}

export interface CIBBINConfig {
  processor_name: string;
  processor_bin_cib: number;
  acquirer_name: string;
  acquirer_bid: number;
  acquirer_bin: number;
}

export interface ReferenceFieldInfo {
  source_table: string;
  source_column: string;
  values: string[];
}

export interface ReferenceValues {
  source_table: string | null;
  fields: Partial<Record<keyof CIBBINConfig, ReferenceFieldInfo>>;
}

// ---------------------------------------------------------------------------
// Remediation Engine types
// ---------------------------------------------------------------------------

export type RemediationStrategy = "auto_fix" | "web_research" | "manual_review";

export interface RemediationFix {
  row_indices: number[];
  column: string;
  old_value: string | null;
  new_value: string | null;
  reasoning: string;
  confidence: number;
  strategy: RemediationStrategy;
  needs_confirmation: boolean;
}

export interface RemediationPlan {
  rule_id: string;
  rule_name: string;
  total_affected: number;
  fixes: RemediationFix[];
  summary: string;
  strategy: RemediationStrategy;
}

export interface WebResearchResult {
  merchant_name: string;
  query: string;
  findings: { source: string; title: string; snippet: string; relevance: string }[];
  suggested_fixes: { column: string; value: string; reasoning: string; confidence?: number }[];
  raw_analysis: string;
  search_queries_used: string[];
}

export interface RemediationApplyResult {
  rows_modified: number;
  new_violation_count: number;
  previous_violation_count: number;
  delta: number;
}

export interface LLMCallLog {
  call_id: number;
  method: string;
  model: string;
  system_prompt: string;
  user_prompt: string;
  output: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  duration_ms: number;
  timestamp: number;
  error: string | null;
}

export interface LLMCallSummary {
  total_calls: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_tokens: number;
  total_cost_usd: number;
  total_duration_ms: number;
  calls: LLMCallLog[];
}
