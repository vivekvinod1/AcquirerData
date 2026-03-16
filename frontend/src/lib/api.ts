import type {
  FileInfo,
  UploadResponse,
  PipelineStatus,
  SchemaMapping,
  QualityReport,
  ViolationReport,
  AMMFPreview,
  CIBBINConfig,
  LLMCallSummary,
  ReferenceValues,
  RemediationPlan,
  RemediationApplyResult,
  WebResearchResult,
  ViolationRows,
  ViolationRuleInfo,
  JobSummary,
  MappingTemplateSummary,
  MappingTemplateDetail,
  TemplateMatch,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function fetchAPI<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || "API request failed");
  }
  return res.json();
}

export async function uploadFiles(files: File[]): Promise<UploadResponse> {
  const formData = new FormData();
  files.forEach((f) => formData.append("files", f));
  const res = await fetch(`${API_BASE}/upload`, { method: "POST", body: formData });
  if (!res.ok) throw new Error("Upload failed");
  return res.json();
}

export async function runPipeline(
  jobId: string,
  cibBinConfig?: CIBBINConfig,
  selectedSteps?: string[],
  selectedViolations?: string[],
  forceReview?: boolean
) {
  return fetchAPI("/pipeline/run", {
    method: "POST",
    body: JSON.stringify({
      job_id: jobId,
      cib_bin_config: cibBinConfig,
      selected_steps: selectedSteps,
      selected_violations: selectedViolations,
      force_review: forceReview || false,
    }),
  });
}

export async function getPipelineStatus(jobId: string): Promise<PipelineStatus> {
  return fetchAPI<PipelineStatus>(`/pipeline/status/${jobId}`);
}

export async function getSchemaMapping(jobId: string): Promise<SchemaMapping | null> {
  return fetchAPI<SchemaMapping | null>(`/schema/${jobId}`);
}

export async function updateSchemaMapping(jobId: string, mapping: SchemaMapping) {
  return fetchAPI(`/schema/${jobId}`, {
    method: "PUT",
    body: JSON.stringify(mapping),
  });
}

export async function getQualityReport(jobId: string): Promise<QualityReport | null> {
  return fetchAPI<QualityReport | null>(`/quality/${jobId}`);
}

export async function getViolations(jobId: string): Promise<ViolationReport | null> {
  return fetchAPI<ViolationReport | null>(`/violations/${jobId}`);
}

export async function getAMMFPreview(jobId: string, page = 1, pageSize = 50): Promise<AMMFPreview> {
  return fetchAPI<AMMFPreview>(`/ammf/${jobId}/preview?page=${page}&page_size=${pageSize}`);
}

export function getAMMFDownloadUrl(jobId: string) {
  return `${API_BASE}/ammf/${jobId}/download`;
}

export function getReportsDownloadUrl(jobId: string) {
  return `${API_BASE}/reports/${jobId}/download`;
}

export async function getGeneratedSQL(jobId: string): Promise<{ sql: string | null }> {
  return fetchAPI<{ sql: string | null }>(`/pipeline/sql/${jobId}`);
}

export async function getLLMLogs(jobId: string): Promise<LLMCallSummary> {
  return fetchAPI<LLMCallSummary>(`/pipeline/llm-logs/${jobId}`);
}

export async function getReferenceValues(jobId: string): Promise<ReferenceValues> {
  return fetchAPI<ReferenceValues>(`/pipeline/reference-values/${jobId}`);
}

// ---------------------------------------------------------------------------
// Violation Rows
// ---------------------------------------------------------------------------

export async function getViolationRows(
  jobId: string,
  ruleId: string,
  page = 1,
  pageSize = 50
): Promise<ViolationRows> {
  return fetchAPI<ViolationRows>(
    `/remediation/rows/${jobId}/${ruleId}?page=${page}&page_size=${pageSize}`
  );
}

// ---------------------------------------------------------------------------
// Remediation Engine
// ---------------------------------------------------------------------------

export async function getRemediationPlan(jobId: string, ruleId: string): Promise<RemediationPlan> {
  return fetchAPI<RemediationPlan>("/remediation/plan", {
    method: "POST",
    body: JSON.stringify({ job_id: jobId, rule_id: ruleId }),
  });
}

export async function applyRemediationFixes(
  jobId: string,
  ruleId: string,
  fixIndices: number[]
): Promise<RemediationApplyResult> {
  return fetchAPI<RemediationApplyResult>("/remediation/apply", {
    method: "POST",
    body: JSON.stringify({ job_id: jobId, rule_id: ruleId, fix_indices: fixIndices }),
  });
}

export async function webResearch(
  jobId: string,
  merchantName: string,
  violationContext: string,
  userObjective: string = "",
  affectedColumns: string[] = []
): Promise<WebResearchResult> {
  return fetchAPI<WebResearchResult>("/remediation/research", {
    method: "POST",
    body: JSON.stringify({
      job_id: jobId,
      merchant_name: merchantName,
      violation_context: violationContext,
      user_objective: userObjective,
      affected_columns: affectedColumns,
    }),
  });
}

export async function applyWebFix(
  jobId: string,
  rowIndex: number,
  fixes: { column: string; value: string }[]
): Promise<{ row_index: number; columns_modified: number }> {
  return fetchAPI("/remediation/apply-web-fix", {
    method: "POST",
    body: JSON.stringify({ job_id: jobId, row_index: rowIndex, fixes }),
  });
}

// ---------------------------------------------------------------------------
// Ingestion & Approval Gate
// ---------------------------------------------------------------------------

export async function getIngestionQuality(jobId: string): Promise<QualityReport | null> {
  return fetchAPI<QualityReport | null>(`/quality/ingestion/${jobId}`);
}

export async function continuePipeline(
  jobId: string,
  selectedViolations?: string[],
  userInstructions?: string,
  saveAsTemplate?: boolean,
  templateName?: string
) {
  return fetchAPI("/pipeline/continue", {
    method: "POST",
    body: JSON.stringify({
      job_id: jobId,
      selected_violations: selectedViolations,
      user_instructions: userInstructions || null,
      save_as_template: saveAsTemplate || false,
      template_name: templateName || null,
    }),
  });
}

export async function approveSql(
  jobId: string,
  approvedSql?: string,
  saveAsTemplate?: boolean,
  templateName?: string
) {
  return fetchAPI("/pipeline/approve-sql", {
    method: "POST",
    body: JSON.stringify({
      job_id: jobId,
      approved_sql: approvedSql || null,
      save_as_template: saveAsTemplate || false,
      template_name: templateName || null,
    }),
  });
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export async function sendChatMessage(
  jobId: string,
  message: string
): Promise<{ response: string }> {
  return fetchAPI<{ response: string }>(`/chat/${jobId}`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

// ---------------------------------------------------------------------------
// Violation Rule Metadata
// ---------------------------------------------------------------------------

export async function getViolationRules(): Promise<ViolationRuleInfo[]> {
  return fetchAPI<ViolationRuleInfo[]>("/violations/rules");
}

// ---------------------------------------------------------------------------
// Job History
// ---------------------------------------------------------------------------

export async function listJobs(): Promise<JobSummary[]> {
  return fetchAPI<JobSummary[]>("/jobs");
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface DQRule {
  id: string;
  name: string;
  description: string;
  threshold: string;
  severity: string;
  editable: boolean;
}

export interface ConfigViolationRule {
  id: string;
  name: string;
  description: string;
  columns: string[];
  sql: string;
  is_custom: boolean;
  is_modified: boolean;
  enabled: boolean;
}

export async function getDQRules(): Promise<DQRule[]> {
  return fetchAPI<DQRule[]>("/config/dq-rules");
}

export async function getConfigViolationRules(): Promise<ConfigViolationRule[]> {
  return fetchAPI<ConfigViolationRule[]>("/config/violation-rules");
}

export async function updateViolationRule(
  ruleId: string,
  update: { name?: string; description?: string; columns?: string[]; sql?: string; enabled?: boolean }
) {
  return fetchAPI(`/config/violation-rules/${ruleId}`, {
    method: "PUT",
    body: JSON.stringify(update),
  });
}

export async function createViolationRule(rule: {
  id: string;
  name: string;
  description: string;
  columns: string[];
  sql: string;
}) {
  return fetchAPI("/config/violation-rules", {
    method: "POST",
    body: JSON.stringify(rule),
  });
}

export async function deleteViolationRule(ruleId: string) {
  return fetchAPI(`/config/violation-rules/${ruleId}`, { method: "DELETE" });
}

export async function resetViolationRules() {
  return fetchAPI("/config/violation-rules/reset", { method: "POST" });
}

// ---------------------------------------------------------------------------
// LLM Prompts
// ---------------------------------------------------------------------------

export interface PromptConfig {
  key: string;
  name: string;
  value: string;
  is_custom: boolean;
  default_value: string;
}

export async function getPrompts(): Promise<PromptConfig[]> {
  return fetchAPI<PromptConfig[]>("/config/prompts");
}

export async function updatePrompt(key: string, value: string) {
  return fetchAPI(`/config/prompts/${key}`, {
    method: "PUT",
    body: JSON.stringify({ value }),
  });
}

export async function resetPrompt(key: string) {
  return fetchAPI(`/config/prompts/${key}`, { method: "DELETE" });
}

export async function resetAllPrompts() {
  return fetchAPI("/config/prompts/reset", { method: "POST" });
}

// ---------------------------------------------------------------------------
// Violation Rule Testing & Resolution Strategy
// ---------------------------------------------------------------------------

export interface TestRuleResult {
  status: "success" | "error";
  error?: string;
  total_rows_flagged: number;
  total_ammf_rows: number;
  sample_rows: Record<string, unknown>[];
  columns: string[];
}

export interface ResolutionStrategy {
  status: "success";
  rule_id: string;
  root_cause: string;
  approach: "auto_fix" | "web_research" | "manual_review";
  fix_sql: string | null;
  fix_explanation: string;
  web_research_guidance: string | null;
  manual_review_guidance: string | null;
  confidence: number;
  caveats: string[];
}

export async function testViolationRule(
  sql: string,
  jobId?: string
): Promise<TestRuleResult> {
  return fetchAPI<TestRuleResult>("/config/violation-rules/test", {
    method: "POST",
    body: JSON.stringify({ sql, job_id: jobId }),
  });
}

export interface LLMStats {
  total_calls: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_usd: number;
  total_duration_ms: number;
  jobs_with_calls: number;
  per_label: Record<string, { calls: number; input_tokens: number; output_tokens: number; cost_usd: number; errors: number }>;
  per_job: { job_id: string; calls: number; input_tokens: number; output_tokens: number; cost_usd: number; duration_ms: number; started_at: string | null }[];
  recent_calls: {
    call_id: number; method: string; label: string; model: string;
    system_prompt: string; user_prompt: string; output: string;
    input_tokens: number; output_tokens: number; cost_usd: number;
    duration_ms: number; timestamp: number; error: string | null;
  }[];
}

export async function getLLMStats(): Promise<LLMStats> {
  return fetchAPI<LLMStats>("/config/llm-stats");
}

// ---------------------------------------------------------------------------
// AI Rule Generator
// ---------------------------------------------------------------------------

export interface GeneratedRule {
  status: "success";
  name: string;
  description: string;
  columns: string[];
  sql: string;
  explanation: string;
  suggested_id: string;
}

export async function generateViolationRule(
  description: string,
  refinement?: string,
  previousSql?: string,
  previousName?: string,
  previousColumns?: string[],
): Promise<GeneratedRule> {
  return fetchAPI<GeneratedRule>("/config/violation-rules/generate", {
    method: "POST",
    body: JSON.stringify({
      description,
      refinement: refinement || null,
      previous_sql: previousSql || null,
      previous_name: previousName || null,
      previous_columns: previousColumns || null,
    }),
  });
}

export async function generateResolutionStrategy(
  ruleId: string,
  ruleName: string,
  description: string,
  columns: string[],
  sql: string,
  sampleRows?: Record<string, unknown>[]
): Promise<ResolutionStrategy> {
  return fetchAPI<ResolutionStrategy>(
    "/config/violation-rules/resolution-strategy",
    {
      method: "POST",
      body: JSON.stringify({
        rule_id: ruleId,
        rule_name: ruleName,
        description,
        columns,
        sql,
        sample_rows: sampleRows,
      }),
    }
  );
}

// ---------------------------------------------------------------------------
// Mapping Templates
// ---------------------------------------------------------------------------

export async function getMappingTemplates(): Promise<MappingTemplateSummary[]> {
  return fetchAPI<MappingTemplateSummary[]>("/config/mapping-templates");
}

export async function getMappingTemplateDetail(fingerprint: string): Promise<MappingTemplateDetail> {
  return fetchAPI<MappingTemplateDetail>(`/config/mapping-templates/${fingerprint}`);
}

export async function deleteMappingTemplate(fingerprint: string) {
  return fetchAPI(`/config/mapping-templates/${fingerprint}`, { method: "DELETE" });
}

export async function resetMappingTemplates() {
  return fetchAPI("/config/mapping-templates/reset", { method: "POST" });
}

export async function checkTemplateMatch(jobId: string): Promise<TemplateMatch> {
  return fetchAPI<TemplateMatch>(`/pipeline/template-check/${jobId}`);
}
