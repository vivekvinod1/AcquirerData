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
  selectedSteps?: string[]
) {
  return fetchAPI("/pipeline/run", {
    method: "POST",
    body: JSON.stringify({
      job_id: jobId,
      cib_bin_config: cibBinConfig,
      selected_steps: selectedSteps,
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
