"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  getDQRules,
  updateDQRule,
  resetDQRule,
  resetAllDQRules,
  getConfigViolationRules,
  updateViolationRule,
  createViolationRule,
  deleteViolationRule,
  resetViolationRules,
  getPrompts,
  updatePrompt,
  resetPrompt,
  resetAllPrompts,
  testViolationRule,
  generateResolutionStrategy,
  getLLMStats,
  generateViolationRule,
  getMappingTemplates,
  getMappingTemplateDetail,
  deleteMappingTemplate,
  resetMappingTemplates,
  type DQRule,
  type ConfigViolationRule,
  type PromptConfig,
  type TestRuleResult,
  type ResolutionStrategy,
  type LLMStats,
  type GeneratedRule,
} from "@/lib/api";
import type { MappingTemplateSummary, MappingTemplateDetail, SchemaMapping } from "@/lib/types";
import SchemaMapEditor from "@/components/SchemaMapEditor";

// ============================================================================
// Shared Components
// ============================================================================

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    critical: "bg-red-100 text-red-700 border-red-200",
    warning: "bg-amber-100 text-amber-700 border-amber-200",
    info: "bg-blue-100 text-blue-700 border-blue-200",
  };
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide border ${colors[severity] || "bg-gray-100 text-gray-600 border-gray-200"}`}>
      {severity}
    </span>
  );
}

function SectionSpinner({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-visa-gray-400">
      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      <span className="text-sm">{text}</span>
    </div>
  );
}

function EmptyState({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="text-center py-16">
      <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-visa-gray-100 flex items-center justify-center text-visa-gray-400">
        {icon}
      </div>
      <p className="text-sm font-medium text-visa-gray-600">{title}</p>
      <p className="text-xs text-visa-gray-400 mt-1">{subtitle}</p>
    </div>
  );
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
      <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span className="text-sm text-red-700 flex-1">{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="px-3 py-1 text-xs font-medium text-red-700 bg-red-100 rounded-lg hover:bg-red-200">
          Retry
        </button>
      )}
    </div>
  );
}

function SuccessToast({ message }: { message: string }) {
  return (
    <div className="fixed bottom-6 right-6 z-50 bg-green-600 text-white px-5 py-3 rounded-xl shadow-lg flex items-center gap-2 animate-in slide-in-from-bottom-4 fade-in duration-300">
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
      <span className="text-sm font-medium">{message}</span>
    </div>
  );
}

// ============================================================================
// Tab Navigation
// ============================================================================

type SettingsTab = "rules" | "prompts" | "llm" | "templates";

const TABS: { key: SettingsTab; label: string; icon: React.ReactNode }[] = [
  {
    key: "rules",
    label: "Rules & Compliance",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
  },
  {
    key: "prompts",
    label: "AI Prompts",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
      </svg>
    ),
  },
  {
    key: "llm",
    label: "LLM Usage",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    key: "templates",
    label: "Mapping Templates",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
      </svg>
    ),
  },
];

// ============================================================================
// DQ Rules Section
// ============================================================================

function DQRulesSection({ rules, loading, error, onRetry, onReload }: {
  rules: DQRule[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onReload: () => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; description: string; threshold: string; severity: string }>({ name: "", description: "", threshold: "", severity: "" });
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const handleToggle = async (rule: DQRule) => {
    try {
      await updateDQRule(rule.id, { enabled: !rule.enabled });
      showToast(`${rule.id} ${rule.enabled ? "disabled" : "enabled"}`);
      onReload();
    } catch { /* ignore */ }
  };

  const startEdit = (rule: DQRule) => {
    setEditingId(rule.id);
    setEditForm({ name: rule.name, description: rule.description, threshold: rule.threshold, severity: rule.severity });
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    try {
      await updateDQRule(editingId, editForm);
      setEditingId(null);
      showToast(`${editingId} updated`);
      onReload();
    } catch (err) { alert(`Failed to save: ${err}`); }
  };

  const handleReset = async (ruleId: string) => {
    if (!confirm(`Reset ${ruleId} to default?`)) return;
    try {
      await resetDQRule(ruleId);
      showToast(`${ruleId} reset to default`);
      onReload();
    } catch { /* ignore */ }
  };

  const handleResetAll = async () => {
    if (!confirm("Reset ALL data quality rules to factory defaults?")) return;
    try {
      await resetAllDQRules();
      showToast("All DQ rules reset to defaults");
      onReload();
    } catch { /* ignore */ }
  };

  if (loading) return <SectionSpinner text="Loading data quality rules..." />;
  if (error) return <ErrorBanner message={error} onRetry={onRetry} />;
  if (rules.length === 0) {
    return (
      <EmptyState
        icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>}
        title="No DQ rules loaded"
        subtitle="Check the backend connection"
      />
    );
  }

  return (
    <>
      {toast && <SuccessToast message={toast} />}

      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-visa-gray-500">
          {rules.length} checks configured &middot; {rules.filter(r => r.enabled).length} enabled
        </p>
        <button onClick={handleResetAll} className="px-3 py-1.5 text-xs font-medium text-visa-gray-600 bg-visa-gray-100 rounded-lg hover:bg-visa-gray-200 transition">
          Reset All
        </button>
      </div>

      <div className="space-y-2">
        {rules.map((rule) => {
          const isOpen = expanded === rule.id;
          const isEditing = editingId === rule.id;
          return (
            <div key={rule.id} className={`border rounded-xl overflow-hidden bg-white transition-all ${!rule.enabled ? "opacity-50 border-visa-gray-200" : "border-visa-gray-200 hover:shadow-sm"}`}>
              <div className="flex items-center gap-3 p-4">
                {/* Toggle */}
                <button
                  onClick={() => handleToggle(rule)}
                  className={`flex-shrink-0 w-10 h-[22px] rounded-full transition-colors relative ${rule.enabled ? "bg-green-500" : "bg-visa-gray-300"}`}
                >
                  <div className={`absolute top-[2px] w-[18px] h-[18px] bg-white rounded-full shadow-sm transition-transform ${rule.enabled ? "left-[20px]" : "left-[2px]"}`} />
                </button>

                {/* Expand trigger */}
                <button
                  onClick={() => setExpanded(isOpen ? null : rule.id)}
                  className="flex-1 flex items-center gap-3 text-left min-w-0"
                >
                  <div className="flex-shrink-0 w-11 h-7 bg-gradient-to-br from-visa-navy to-visa-blue text-white rounded-lg flex items-center justify-center text-[11px] font-bold shadow-sm">
                    {rule.id}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-visa-navy truncate">{rule.name}</span>
                      <SeverityBadge severity={rule.severity} />
                      {rule.is_modified && (
                        <span className="px-2 py-0.5 bg-amber-100 text-amber-700 border border-amber-200 rounded-full text-[10px] font-semibold uppercase tracking-wide">Modified</span>
                      )}
                    </div>
                    <p className="text-xs text-visa-gray-500 mt-0.5 truncate">{rule.description}</p>
                  </div>
                  <svg className={`w-4 h-4 text-visa-gray-400 transition-transform duration-200 flex-shrink-0 ${isOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Quick actions */}
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => startEdit(rule)} className="p-1.5 text-visa-gray-400 hover:text-visa-navy hover:bg-visa-gray-100 rounded-lg transition" title="Edit">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  {rule.is_modified && (
                    <button onClick={() => handleReset(rule.id)} className="p-1.5 text-visa-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition" title="Reset to default">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              {/* Edit form */}
              {isEditing && (
                <div className="border-t border-visa-gray-100 px-4 pb-4 pt-3 bg-blue-50/30">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-semibold text-visa-gray-500 uppercase">Name</label>
                      <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="w-full mt-1 text-sm border border-visa-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-visa-navy" />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-visa-gray-500 uppercase">Threshold</label>
                      <input value={editForm.threshold} onChange={(e) => setEditForm({ ...editForm, threshold: e.target.value })} className="w-full mt-1 text-sm border border-visa-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-visa-navy" />
                    </div>
                    <div className="col-span-2">
                      <label className="text-[11px] font-semibold text-visa-gray-500 uppercase">Description</label>
                      <textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} rows={2} className="w-full mt-1 text-sm border border-visa-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-visa-navy" />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-visa-gray-500 uppercase">Severity</label>
                      <select value={editForm.severity} onChange={(e) => setEditForm({ ...editForm, severity: e.target.value })} className="w-full mt-1 text-sm border border-visa-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-visa-navy">
                        <option value="info">Info</option>
                        <option value="warning">Warning</option>
                        <option value="critical">Critical</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={handleSaveEdit} className="px-4 py-2 bg-visa-navy text-white text-xs font-medium rounded-lg hover:bg-visa-blue transition">Save</button>
                    <button onClick={() => setEditingId(null)} className="px-4 py-2 bg-visa-gray-200 text-visa-gray-700 text-xs font-medium rounded-lg hover:bg-visa-gray-300 transition">Cancel</button>
                  </div>
                </div>
              )}

              {/* Expanded detail */}
              {isOpen && !isEditing && (
                <div className="px-4 pb-4 pt-0 border-t border-visa-gray-100">
                  <div className="bg-visa-gray-50 rounded-lg p-4 mt-3 space-y-3">
                    <div>
                      <span className="text-[11px] font-semibold text-visa-gray-500 uppercase tracking-wide">Description</span>
                      <p className="text-sm text-visa-gray-700 mt-1">{rule.description}</p>
                    </div>
                    <div className="flex gap-6">
                      <div>
                        <span className="text-[11px] font-semibold text-visa-gray-500 uppercase tracking-wide">Threshold</span>
                        <p className="text-sm text-visa-navy font-medium mt-1">{rule.threshold}</p>
                      </div>
                      <div>
                        <span className="text-[11px] font-semibold text-visa-gray-500 uppercase tracking-wide">Severity</span>
                        <p className="mt-1"><SeverityBadge severity={rule.severity} /></p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

// ============================================================================
// Violation Rules Section
// ============================================================================

function ViolationRulesSection({
  rules, loading, error, onRetry, onReload,
}: {
  rules: ConfigViolationRule[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onReload: () => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editingRule, setEditingRule] = useState<ConfigViolationRule | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, TestRuleResult>>({});
  const [testingRule, setTestingRule] = useState<string | null>(null);
  const [resolutionStrategy, setResolutionStrategy] = useState<ResolutionStrategy | null>(null);
  const [generatingStrategy, setGeneratingStrategy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleToggle = async (rule: ConfigViolationRule) => {
    try {
      await updateViolationRule(rule.id, { enabled: !rule.enabled });
      showToast(`${rule.id} ${rule.enabled ? "disabled" : "enabled"}`);
      onReload();
    } catch { /* ignore */ }
  };

  const handleSaveEdit = async (data: { id: string; name: string; description: string; columns: string[]; sql: string }) => {
    try {
      await updateViolationRule(data.id, { name: data.name, description: data.description, columns: data.columns, sql: data.sql });
      setEditingRule(null);
      showToast(`${data.id} updated`);
      onReload();
    } catch (err) { alert(`Failed to save: ${err}`); }
  };

  const handleCreate = async (data: { id: string; name: string; description: string; columns: string[]; sql: string }) => {
    try {
      await createViolationRule(data);
      setIsCreating(false);
      showToast(`${data.id} created`);
      onReload();
    } catch (err) { alert(`Failed to create: ${err}`); }
  };

  const handleDelete = async (ruleId: string, isCustom: boolean) => {
    const action = isCustom ? "delete" : "reset to default";
    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} rule ${ruleId}?`)) return;
    try {
      await deleteViolationRule(ruleId);
      showToast(`${ruleId} ${isCustom ? "deleted" : "reset"}`);
      onReload();
    } catch (err) { alert(`Failed: ${err}`); }
  };

  const handleResetAll = async () => {
    if (!confirm("Reset ALL violation rules to factory defaults? This removes all custom rules and edits.")) return;
    try {
      await resetViolationRules();
      showToast("All rules reset to defaults");
      onReload();
    } catch { /* ignore */ }
  };

  const handleTestRule = async (rule: ConfigViolationRule) => {
    setTestingRule(rule.id);
    try {
      const result = await testViolationRule(rule.sql);
      setTestResults((prev) => ({ ...prev, [rule.id]: result }));
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [rule.id]: { status: "error", error: `${err}`, total_rows_flagged: 0, total_ammf_rows: 0, sample_rows: [], columns: [] },
      }));
    } finally { setTestingRule(null); }
  };

  const handleGenerateStrategy = async (rule: ConfigViolationRule) => {
    setGeneratingStrategy(rule.id);
    try {
      const sampleRows = testResults[rule.id]?.sample_rows;
      const result = await generateResolutionStrategy(rule.id, rule.name, rule.description, rule.columns, rule.sql, sampleRows as Record<string, unknown>[]);
      setResolutionStrategy(result);
    } catch (err) { alert(`Failed to generate strategy: ${err}`); }
    finally { setGeneratingStrategy(null); }
  };

  if (loading) return <SectionSpinner text="Loading violation rules..." />;
  if (error) return <ErrorBanner message={error} onRetry={onRetry} />;

  return (
    <>
      {toast && <SuccessToast message={toast} />}

      {/* Actions bar */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-visa-gray-500">
          {rules.length} rules configured &middot; {rules.filter(r => r.enabled).length} enabled
        </p>
        <div className="flex gap-2">
          <button onClick={handleResetAll} className="px-3 py-1.5 text-xs font-medium text-visa-gray-600 bg-visa-gray-100 rounded-lg hover:bg-visa-gray-200 transition">
            Reset All
          </button>
          <button
            onClick={() => setIsCreating(true)}
            className="px-3 py-1.5 text-xs font-medium text-white bg-visa-navy rounded-lg hover:bg-visa-blue transition flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Rule
          </button>
        </div>
      </div>

      {/* Rule cards */}
      <div className="space-y-2">
        {rules.map((rule) => {
          const isOpen = expanded === rule.id;
          const testResult = testResults[rule.id];
          return (
            <div
              key={rule.id}
              className={`border rounded-xl overflow-hidden bg-white transition-all ${
                !rule.enabled ? "opacity-50 border-visa-gray-200" : "border-visa-gray-200 hover:shadow-sm"
              }`}
            >
              {/* Header */}
              <div className="flex items-center gap-3 p-4">
                {/* Toggle */}
                <button
                  onClick={() => handleToggle(rule)}
                  className={`flex-shrink-0 w-10 h-[22px] rounded-full transition-colors relative ${rule.enabled ? "bg-green-500" : "bg-visa-gray-300"}`}
                >
                  <div className={`absolute top-[2px] w-[18px] h-[18px] bg-white rounded-full shadow-sm transition-transform ${rule.enabled ? "left-[20px]" : "left-[2px]"}`} />
                </button>

                {/* Expand trigger */}
                <button
                  onClick={() => setExpanded(isOpen ? null : rule.id)}
                  className="flex-1 flex items-center gap-3 text-left min-w-0"
                >
                  <div className="flex-shrink-0 w-11 h-7 bg-gradient-to-br from-visa-navy to-visa-blue text-white rounded-lg flex items-center justify-center text-[11px] font-bold shadow-sm">
                    {rule.id}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-visa-navy truncate">{rule.name}</span>
                      {rule.is_custom && (
                        <span className="px-2 py-0.5 bg-purple-100 text-purple-700 border border-purple-200 rounded-full text-[10px] font-semibold uppercase tracking-wide">Custom</span>
                      )}
                      {rule.is_modified && !rule.is_custom && (
                        <span className="px-2 py-0.5 bg-amber-100 text-amber-700 border border-amber-200 rounded-full text-[10px] font-semibold uppercase tracking-wide">Modified</span>
                      )}
                    </div>
                    <p className="text-xs text-visa-gray-500 mt-0.5 truncate">{rule.description}</p>
                  </div>
                  <svg className={`w-4 h-4 text-visa-gray-400 transition-transform duration-200 flex-shrink-0 ${isOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Quick actions */}
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => setEditingRule(rule)} className="p-1.5 text-visa-gray-400 hover:text-visa-navy hover:bg-visa-gray-100 rounded-lg transition" title="Edit">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  {(rule.is_custom || rule.is_modified) && (
                    <button onClick={() => handleDelete(rule.id, rule.is_custom)} className="p-1.5 text-visa-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition" title={rule.is_custom ? "Delete" : "Reset"}>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded content */}
              {isOpen && (
                <div className="border-t border-visa-gray-100 px-4 pb-4">
                  {/* Columns */}
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {rule.columns.map((col) => (
                      <span key={col} className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-100 rounded-lg text-xs font-medium">
                        {col}
                      </span>
                    ))}
                  </div>

                  {/* Description */}
                  <p className="text-sm text-visa-gray-600 mt-3 leading-relaxed">{rule.description}</p>

                  {/* SQL */}
                  {rule.sql && (
                    <div className="mt-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[11px] font-semibold text-visa-gray-500 uppercase tracking-wide">Detection SQL</span>
                        <div className="flex-1 h-px bg-visa-gray-200" />
                      </div>
                      <pre className="p-4 bg-visa-gray-900 text-green-400 rounded-xl text-xs overflow-x-auto max-h-56 overflow-y-auto font-mono leading-relaxed">
                        {rule.sql}
                      </pre>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 mt-4">
                    <button
                      onClick={() => handleTestRule(rule)}
                      disabled={testingRule === rule.id || !rule.sql}
                      className="px-3.5 py-2 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50 transition flex items-center gap-1.5"
                    >
                      {testingRule === rule.id ? (
                        <span className="inline-block w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      )}
                      Test Rule
                    </button>
                    <button
                      onClick={() => handleGenerateStrategy(rule)}
                      disabled={generatingStrategy === rule.id || !rule.sql}
                      className="px-3.5 py-2 text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-100 disabled:opacity-50 transition flex items-center gap-1.5"
                    >
                      {generatingStrategy === rule.id ? (
                        <span className="inline-block w-3.5 h-3.5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                      )}
                      {generatingStrategy === rule.id ? "Analyzing..." : "AI Resolution Strategy"}
                    </button>
                    <button
                      onClick={() => setEditingRule(rule)}
                      className="px-3.5 py-2 text-xs font-medium text-visa-gray-600 bg-visa-gray-100 border border-visa-gray-200 rounded-lg hover:bg-visa-gray-200 transition flex items-center gap-1.5"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Edit Rule
                    </button>
                  </div>

                  {/* Test Results */}
                  {testResult && (
                    <div className={`mt-4 p-4 rounded-xl text-sm border ${
                      testResult.status === "error"
                        ? "bg-red-50 border-red-200"
                        : testResult.total_rows_flagged > 0
                        ? "bg-amber-50 border-amber-200"
                        : "bg-green-50 border-green-200"
                    }`}>
                      {testResult.status === "error" ? (
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="font-semibold text-red-700">SQL Error</span>
                          </div>
                          <pre className="text-red-600 text-xs font-mono mt-1 whitespace-pre-wrap">{testResult.error}</pre>
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center gap-4 mb-3">
                            <span className="font-bold text-visa-navy text-lg">
                              {testResult.total_rows_flagged.toLocaleString()}
                            </span>
                            <span className="text-sm text-visa-gray-600">
                              rows flagged out of {testResult.total_ammf_rows.toLocaleString()}
                            </span>
                            {testResult.total_rows_flagged === 0 && (
                              <span className="px-2 py-0.5 text-xs font-semibold text-green-700 bg-green-100 rounded-full">Clean</span>
                            )}
                          </div>
                          {testResult.sample_rows.length > 0 && (
                            <div className="overflow-x-auto rounded-lg border border-visa-gray-200">
                              <table className="text-xs w-full border-collapse">
                                <thead>
                                  <tr>
                                    {testResult.columns.slice(0, 8).map((col) => (
                                      <th key={col} className="px-3 py-2 text-left bg-visa-gray-100 font-semibold text-visa-gray-600 whitespace-nowrap border-b border-visa-gray-200">
                                        {col}
                                      </th>
                                    ))}
                                    {testResult.columns.length > 8 && (
                                      <th className="px-3 py-2 bg-visa-gray-100 border-b border-visa-gray-200 text-visa-gray-400 text-center">
                                        +{testResult.columns.length - 8}
                                      </th>
                                    )}
                                  </tr>
                                </thead>
                                <tbody>
                                  {testResult.sample_rows.slice(0, 5).map((row, i) => (
                                    <tr key={i} className="hover:bg-visa-gray-50">
                                      {testResult.columns.slice(0, 8).map((col) => (
                                        <td key={col} className="px-3 py-2 border-b border-visa-gray-100 max-w-40 truncate whitespace-nowrap">
                                          {String(row[col] ?? "")}
                                        </td>
                                      ))}
                                      {testResult.columns.length > 8 && (
                                        <td className="px-3 py-2 border-b border-visa-gray-100 text-visa-gray-400 text-center">...</td>
                                      )}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              {testResult.total_rows_flagged > 5 && (
                                <p className="text-xs text-visa-gray-400 p-2 text-center bg-visa-gray-50">
                                  Showing 5 of {testResult.total_rows_flagged.toLocaleString()} flagged rows
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Edit Modal */}
      {editingRule && (
        <RuleEditorModal rule={editingRule} isNew={false} onSave={handleSaveEdit} onCancel={() => setEditingRule(null)} />
      )}
      {isCreating && (
        <AIRuleBuilderModal onSave={handleCreate} onCancel={() => setIsCreating(false)} />
      )}
      {resolutionStrategy && (
        <ResolutionStrategyModal strategy={resolutionStrategy} onClose={() => setResolutionStrategy(null)} />
      )}
    </>
  );
}

// ============================================================================
// Rule Editor Modal
// ============================================================================

function RuleEditorModal({
  rule, isNew, onSave, onCancel,
}: {
  rule: Partial<ConfigViolationRule> | null;
  isNew: boolean;
  onSave: (data: { id: string; name: string; description: string; columns: string[]; sql: string }) => void;
  onCancel: () => void;
}) {
  const [id, setId] = useState(rule?.id || "");
  const [name, setName] = useState(rule?.name || "");
  const [description, setDescription] = useState(rule?.description || "");
  const [columns, setColumns] = useState(rule?.columns?.join(", ") || "");
  const [sql, setSql] = useState(rule?.sql || "");

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-visa-gray-200 bg-visa-gray-50/50 rounded-t-2xl">
          <h3 className="text-lg font-bold text-visa-navy">
            {isNew ? "Add New Violation Rule" : `Edit Rule ${rule?.id}`}
          </h3>
          <p className="text-sm text-visa-gray-500 mt-1">
            {isNew ? "Define a new SQL-based violation check" : "Modify the rule configuration and SQL query"}
          </p>
        </div>
        <div className="p-6 space-y-5">
          {isNew && (
            <div>
              <label className="block text-sm font-semibold text-visa-gray-700 mb-1.5">Rule ID</label>
              <input type="text" value={id} onChange={(e) => setId(e.target.value.toUpperCase())}
                className="w-full border border-visa-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-visa-navy/20 focus:border-visa-navy outline-none transition"
                placeholder="e.g., V14" />
            </div>
          )}
          <div>
            <label className="block text-sm font-semibold text-visa-gray-700 mb-1.5">Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              className="w-full border border-visa-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-visa-navy/20 focus:border-visa-navy outline-none transition"
              placeholder="Rule name" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-visa-gray-700 mb-1.5">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              className="w-full border border-visa-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-visa-navy/20 focus:border-visa-navy outline-none transition resize-y" rows={2}
              placeholder="What does this rule check?" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-visa-gray-700 mb-1.5">
              Target Columns <span className="text-visa-gray-400 font-normal">(comma-separated)</span>
            </label>
            <input type="text" value={columns} onChange={(e) => setColumns(e.target.value)}
              className="w-full border border-visa-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-visa-navy/20 focus:border-visa-navy outline-none transition"
              placeholder="e.g., DBAName, LegalName, Street" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-visa-gray-700 mb-1.5">
              SQL Query <span className="text-visa-gray-400 font-normal">(DuckDB dialect, table: ammf_output)</span>
            </label>
            <textarea value={sql} onChange={(e) => setSql(e.target.value)}
              className="w-full border border-visa-gray-300 rounded-xl px-4 py-3 text-sm font-mono bg-visa-gray-50 focus:ring-2 focus:ring-visa-navy/20 focus:border-visa-navy outline-none transition resize-y leading-relaxed" rows={12}
              spellCheck={false}
              placeholder={`SELECT *, '${id || "Vxx"}' AS violation_id\nFROM ammf_output\nWHERE ...`} />
            <p className="text-xs text-visa-gray-400 mt-1.5">
              Query must return rows that violate the rule from the <code className="bg-visa-gray-100 px-1 rounded">ammf_output</code> table.
            </p>
          </div>
        </div>
        <div className="p-6 border-t border-visa-gray-200 bg-visa-gray-50/50 rounded-b-2xl flex justify-end gap-3">
          <button onClick={onCancel} className="px-5 py-2.5 text-sm font-medium text-visa-gray-600 bg-white border border-visa-gray-300 rounded-xl hover:bg-visa-gray-50 transition">
            Cancel
          </button>
          <button
            onClick={() => onSave({ id: isNew ? id : rule?.id || "", name, description, columns: columns.split(",").map((c) => c.trim()).filter(Boolean), sql })}
            disabled={!name || !sql || (isNew && !id)}
            className="px-5 py-2.5 text-sm font-medium text-white bg-visa-navy rounded-xl hover:bg-visa-blue disabled:opacity-50 transition"
          >
            {isNew ? "Create Rule" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// AI Rule Builder Modal
// ============================================================================

function AIRuleBuilderModal({
  onSave,
  onCancel,
}: {
  onSave: (data: { id: string; name: string; description: string; columns: string[]; sql: string }) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<"describe" | "review">("describe");
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [refineInput, setRefineInput] = useState("");
  const [refining, setRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generated result (editable)
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [columns, setColumns] = useState("");
  const [sql, setSql] = useState("");
  const [explanation, setExplanation] = useState("");

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const result = await generateViolationRule(prompt);
      setId(result.suggested_id);
      setName(result.name);
      setDescription(result.description);
      setColumns(result.columns.join(", "));
      setSql(result.sql);
      setExplanation(result.explanation);
      setStep("review");
    } catch (err) {
      setError(`${err}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleRefine = async () => {
    if (!refineInput.trim()) return;
    setRefining(true);
    setError(null);
    try {
      const result = await generateViolationRule(
        prompt,
        refineInput,
        sql,
        name,
        columns.split(",").map(c => c.trim()).filter(Boolean),
      );
      setName(result.name);
      setDescription(result.description);
      setColumns(result.columns.join(", "));
      setSql(result.sql);
      setExplanation(result.explanation);
      if (result.suggested_id) setId(result.suggested_id);
      setRefineInput("");
    } catch (err) {
      setError(`${err}`);
    } finally {
      setRefining(false);
    }
  };

  const examplePrompts = [
    "Find merchants where the DBA name contains only numbers or special characters",
    "Detect merchants with the same legal name but different tax IDs",
    "Flag records where the postal code format doesn't match the country",
    "Find merchants where the city name contains digits",
    "Detect duplicate merchants with slightly different names at the same address",
  ];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-visa-gray-200 bg-gradient-to-r from-purple-50 via-blue-50 to-indigo-50 rounded-t-2xl">
          <h3 className="text-lg font-bold text-visa-navy flex items-center gap-2">
            <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            AI Rule Builder
          </h3>
          <p className="text-sm text-visa-gray-500 mt-1">
            {step === "describe"
              ? "Describe what you want to check in plain English. AI will generate the SQL and metadata."
              : "Review the generated rule. You can refine it with follow-up instructions or edit fields directly."}
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-3 px-6 py-3 bg-visa-gray-50 border-b border-visa-gray-200">
          <div className={`flex items-center gap-2 text-xs font-semibold ${step === "describe" ? "text-purple-700" : "text-visa-gray-400"}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] ${step === "describe" ? "bg-purple-600 text-white" : "bg-visa-gray-200 text-visa-gray-500"}`}>1</span>
            Describe
          </div>
          <div className="w-8 h-px bg-visa-gray-300" />
          <div className={`flex items-center gap-2 text-xs font-semibold ${step === "review" ? "text-purple-700" : "text-visa-gray-400"}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] ${step === "review" ? "bg-purple-600 text-white" : "bg-visa-gray-200 text-visa-gray-500"}`}>2</span>
            Review & Save
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === "describe" && (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-visa-gray-700 mb-2">
                  What data quality issue should this rule detect?
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="w-full border border-visa-gray-300 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none transition resize-y leading-relaxed"
                  rows={4}
                  placeholder="e.g., Find merchants where the DBA name is suspiciously short (less than 3 characters) or contains only generic words like 'TEST' or 'MERCHANT'"
                  autoFocus
                />
              </div>

              {/* Example prompts */}
              <div>
                <span className="text-[11px] font-semibold text-visa-gray-500 uppercase tracking-wide">Example ideas</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {examplePrompts.map((ex, i) => (
                    <button
                      key={i}
                      onClick={() => setPrompt(ex)}
                      className="px-3 py-1.5 text-xs text-visa-gray-600 bg-visa-gray-100 rounded-lg hover:bg-purple-50 hover:text-purple-700 transition text-left"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </div>

              {error && <ErrorBanner message={error} />}
            </div>
          )}

          {step === "review" && (
            <div className="space-y-5">
              {/* AI Explanation */}
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                <div className="flex items-start gap-2">
                  <svg className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  <div>
                    <span className="text-xs font-semibold text-purple-700 uppercase tracking-wide">AI Explanation</span>
                    <p className="text-sm text-purple-800 mt-1 leading-relaxed whitespace-pre-line">{explanation}</p>
                  </div>
                </div>
              </div>

              {/* Editable fields */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-visa-gray-700 mb-1.5">Rule ID</label>
                  <input type="text" value={id} onChange={(e) => setId(e.target.value.toUpperCase())}
                    className="w-full border border-visa-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-visa-navy/20 focus:border-visa-navy outline-none transition"
                    placeholder="V14" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-visa-gray-700 mb-1.5">Name</label>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                    className="w-full border border-visa-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-visa-navy/20 focus:border-visa-navy outline-none transition" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-visa-gray-700 mb-1.5">Description</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)}
                  className="w-full border border-visa-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-visa-navy/20 focus:border-visa-navy outline-none transition resize-y" rows={2} />
              </div>

              <div>
                <label className="block text-sm font-semibold text-visa-gray-700 mb-1.5">
                  Target Columns <span className="text-visa-gray-400 font-normal">(comma-separated)</span>
                </label>
                <input type="text" value={columns} onChange={(e) => setColumns(e.target.value)}
                  className="w-full border border-visa-gray-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-visa-navy/20 focus:border-visa-navy outline-none transition" />
              </div>

              <div>
                <label className="block text-sm font-semibold text-visa-gray-700 mb-1.5">
                  SQL Query <span className="text-visa-gray-400 font-normal">(DuckDB dialect)</span>
                </label>
                <textarea value={sql} onChange={(e) => setSql(e.target.value)}
                  className="w-full border border-visa-gray-300 rounded-xl px-4 py-3 text-sm font-mono bg-visa-gray-50 focus:ring-2 focus:ring-visa-navy/20 focus:border-visa-navy outline-none transition resize-y leading-relaxed" rows={10}
                  spellCheck={false} />
              </div>

              {/* Refine with AI */}
              <div className="border border-purple-200 rounded-xl p-4 bg-purple-50/50">
                <label className="block text-xs font-semibold text-purple-700 uppercase tracking-wide mb-2">
                  Refine with AI
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={refineInput}
                    onChange={(e) => setRefineInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !refining && handleRefine()}
                    className="flex-1 border border-purple-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none transition bg-white"
                    placeholder="e.g., Also check for names with only uppercase letters, or exclude records where MerchantType = 'PF'"
                    disabled={refining}
                  />
                  <button
                    onClick={handleRefine}
                    disabled={refining || !refineInput.trim()}
                    className="px-4 py-2 text-xs font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 transition flex items-center gap-1.5 flex-shrink-0"
                  >
                    {refining ? (
                      <span className="inline-block w-3.5 h-3.5 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    )}
                    {refining ? "Refining..." : "Refine"}
                  </button>
                </div>
              </div>

              {error && <ErrorBanner message={error} />}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-visa-gray-200 bg-visa-gray-50/50 rounded-b-2xl flex justify-between">
          <div>
            {step === "review" && (
              <button onClick={() => setStep("describe")} className="px-4 py-2 text-sm text-visa-gray-600 hover:text-visa-navy transition flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Back to Description
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button onClick={onCancel} className="px-5 py-2.5 text-sm font-medium text-visa-gray-600 bg-white border border-visa-gray-300 rounded-xl hover:bg-visa-gray-50 transition">
              Cancel
            </button>
            {step === "describe" ? (
              <button
                onClick={handleGenerate}
                disabled={generating || !prompt.trim()}
                className="px-5 py-2.5 text-sm font-medium text-white bg-purple-600 rounded-xl hover:bg-purple-700 disabled:opacity-50 transition flex items-center gap-2"
              >
                {generating ? (
                  <>
                    <span className="inline-block w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                    Generating Rule...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    Generate with AI
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={() => onSave({ id, name, description, columns: columns.split(",").map(c => c.trim()).filter(Boolean), sql })}
                disabled={!id || !name || !sql}
                className="px-5 py-2.5 text-sm font-medium text-white bg-visa-navy rounded-xl hover:bg-visa-blue disabled:opacity-50 transition"
              >
                Create Rule
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Resolution Strategy Modal
// ============================================================================

function ResolutionStrategyModal({ strategy, onClose }: { strategy: ResolutionStrategy; onClose: () => void }) {
  const approachConfig: Record<string, { label: string; color: string; icon: string }> = {
    auto_fix: { label: "Auto-Fixable", color: "bg-green-100 text-green-700 border-green-200", icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" },
    web_research: { label: "Web Research", color: "bg-blue-100 text-blue-700 border-blue-200", icon: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" },
    manual_review: { label: "Manual Review", color: "bg-amber-100 text-amber-700 border-amber-200", icon: "M15 12a3 3 0 11-6 0 3 3 0 016 0z" },
  };
  const approach = approachConfig[strategy.approach] || approachConfig.manual_review;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-visa-gray-200 bg-gradient-to-r from-purple-50 to-blue-50 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-visa-navy flex items-center gap-2">
                <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                Resolution Strategy: {strategy.rule_id}
              </h3>
              <p className="text-sm text-visa-gray-500 mt-1">AI-generated analysis of how to resolve violations</p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${approach.color}`}>
                {approach.label}
              </span>
              <div className="text-right">
                <div className="text-lg font-bold text-visa-navy">{Math.round(strategy.confidence * 100)}%</div>
                <div className="text-[10px] text-visa-gray-500 uppercase tracking-wide">Confidence</div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <StrategySection title="Root Cause" color="visa-navy"
            icon="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z">
            <p className="text-sm text-visa-gray-700 leading-relaxed">{strategy.root_cause}</p>
          </StrategySection>

          <StrategySection title="Resolution Steps" color="visa-navy"
            icon="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4">
            <p className="text-sm text-visa-gray-700 leading-relaxed whitespace-pre-line">{strategy.fix_explanation}</p>
          </StrategySection>

          {strategy.fix_sql && (
            <StrategySection title="Fix SQL (DuckDB)" color="green-700"
              icon="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4">
              <pre className="text-xs font-mono bg-visa-gray-900 text-green-400 rounded-xl p-4 overflow-x-auto max-h-64 overflow-y-auto leading-relaxed">
                {strategy.fix_sql}
              </pre>
              <p className="text-xs text-visa-gray-400 mt-2">
                Review carefully before executing against the <code className="bg-visa-gray-100 px-1 rounded">ammf_output</code> table.
              </p>
            </StrategySection>
          )}

          {strategy.web_research_guidance && (
            <StrategySection title="Web Research Guidance" color="blue-700"
              icon="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" bg="bg-blue-50">
              <p className="text-sm text-visa-gray-700 leading-relaxed whitespace-pre-line">{strategy.web_research_guidance}</p>
            </StrategySection>
          )}

          {strategy.manual_review_guidance && (
            <StrategySection title="Manual Review Required" color="amber-700"
              icon="M15 12a3 3 0 11-6 0 3 3 0 016 0z" bg="bg-amber-50">
              <p className="text-sm text-visa-gray-700 leading-relaxed whitespace-pre-line">{strategy.manual_review_guidance}</p>
            </StrategySection>
          )}

          {strategy.caveats && strategy.caveats.length > 0 && (
            <div className="bg-visa-gray-50 rounded-xl p-4">
              <h4 className="text-xs font-semibold text-visa-gray-500 uppercase tracking-wide mb-2">Caveats</h4>
              <ul className="space-y-1.5">
                {strategy.caveats.map((c, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-visa-gray-600">
                    <span className="text-visa-gray-400 mt-0.5 flex-shrink-0">&#8226;</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-visa-gray-200 flex justify-end">
          <button onClick={onClose} className="px-5 py-2.5 text-sm font-medium text-white bg-visa-navy rounded-xl hover:bg-visa-blue transition">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function StrategySection({ title, color, icon, bg, children }: {
  title: string; color: string; icon: string; bg?: string; children: React.ReactNode;
}) {
  return (
    <div className={`${bg || "bg-visa-gray-50"} rounded-xl p-4`}>
      <h4 className={`text-sm font-semibold text-${color} mb-2 flex items-center gap-2`}>
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
        </svg>
        {title}
      </h4>
      {children}
    </div>
  );
}

// ============================================================================
// LLM Prompts Section
// ============================================================================

function LLMPromptsSection({ prompts, loading, error, onRetry, onReload }: {
  prompts: PromptConfig[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onReload: () => void;
}) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleEdit = (p: PromptConfig) => {
    setEditingKey(p.key);
    setEditValue(p.value);
  };

  const handleSave = async () => {
    if (!editingKey) return;
    setSaving(true);
    try {
      await updatePrompt(editingKey, editValue);
      setEditingKey(null);
      showToast("Prompt saved");
      onReload();
    } catch (err) {
      alert(`Failed to save: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async (key: string) => {
    if (!confirm("Reset this prompt to its factory default?")) return;
    try {
      await resetPrompt(key);
      showToast("Prompt reset to default");
      onReload();
    } catch (err) {
      alert(`Failed to reset: ${err}`);
    }
  };

  const handleResetAll = async () => {
    if (!confirm("Reset ALL prompts to factory defaults?")) return;
    try {
      await resetAllPrompts();
      showToast("All prompts reset");
      onReload();
    } catch { /* ignore */ }
  };

  if (loading) return <SectionSpinner text="Loading AI prompts..." />;
  if (error) return <ErrorBanner message={error} onRetry={onRetry} />;

  const promptIcons: Record<string, string> = {
    schema_mapping: "M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z",
    relationship_discovery: "M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1",
    sql_generation: "M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4",
    chat: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z",
  };

  const promptColors: Record<string, string> = {
    schema_mapping: "from-blue-500 to-blue-600",
    relationship_discovery: "from-purple-500 to-purple-600",
    sql_generation: "from-green-500 to-green-600",
    chat: "from-amber-500 to-amber-600",
  };

  return (
    <>
      {toast && <SuccessToast message={toast} />}

      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-visa-gray-500">
          {prompts.length} prompts &middot; {prompts.filter(p => p.is_custom).length} customized
        </p>
        <button onClick={handleResetAll} className="px-3 py-1.5 text-xs font-medium text-visa-gray-600 bg-visa-gray-100 rounded-lg hover:bg-visa-gray-200 transition">
          Reset All to Defaults
        </button>
      </div>

      <div className="space-y-3">
        {prompts.map((p) => {
          const isOpen = expanded === p.key;
          const icon = promptIcons[p.key] || promptIcons.chat;
          const gradient = promptColors[p.key] || "from-gray-500 to-gray-600";

          return (
            <div key={p.key} className="border border-visa-gray-200 rounded-xl overflow-hidden bg-white hover:shadow-sm transition-shadow">
              <button
                onClick={() => setExpanded(isOpen ? null : p.key)}
                className="w-full flex items-center gap-4 p-4 text-left hover:bg-visa-gray-50/50 transition"
              >
                <div className={`flex-shrink-0 w-11 h-11 bg-gradient-to-br ${gradient} text-white rounded-xl flex items-center justify-center shadow-sm`}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-visa-navy">{p.name}</span>
                    <code className="text-[10px] bg-visa-gray-100 text-visa-gray-500 px-1.5 py-0.5 rounded font-mono">
                      {p.key}
                    </code>
                    {p.is_custom && (
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-700 border border-amber-200 rounded-full text-[10px] font-semibold uppercase tracking-wide">
                        Customized
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-visa-gray-500 mt-0.5 truncate">
                    {p.value.slice(0, 100)}...
                  </p>
                </div>
                <svg className={`w-4 h-4 text-visa-gray-400 transition-transform duration-200 flex-shrink-0 ${isOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isOpen && (
                <div className="border-t border-visa-gray-100 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[11px] font-semibold text-visa-gray-500 uppercase tracking-wide">
                      {p.is_custom ? "Custom Prompt" : "Default Prompt"}
                    </span>
                    <div className="flex-1 h-px bg-visa-gray-200" />
                    <span className="text-[11px] text-visa-gray-400">
                      ~{Math.round(p.value.length / 4)} tokens
                    </span>
                  </div>
                  <pre className="p-4 bg-visa-gray-50 border border-visa-gray-200 rounded-xl text-xs font-mono text-visa-gray-700 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
                    {p.value}
                  </pre>

                  <div className="flex items-center gap-2 mt-4">
                    <button onClick={() => handleEdit(p)}
                      className="px-3.5 py-2 text-xs font-medium text-white bg-visa-navy rounded-lg hover:bg-visa-blue transition flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Edit Prompt
                    </button>
                    {p.is_custom && (
                      <button onClick={() => handleReset(p.key)}
                        className="px-3.5 py-2 text-xs font-medium text-visa-gray-600 bg-visa-gray-100 border border-visa-gray-200 rounded-lg hover:bg-visa-gray-200 transition">
                        Restore Default
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {prompts.length === 0 && (
        <EmptyState
          icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>}
          title="No prompts available"
          subtitle="The prompt configuration endpoint may not be available. Check backend logs."
        />
      )}

      {/* Edit Modal */}
      {editingKey && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-visa-gray-200 bg-visa-gray-50/50 rounded-t-2xl">
              <h3 className="text-lg font-bold text-visa-navy">
                Edit Prompt: {prompts.find((p) => p.key === editingKey)?.name}
              </h3>
              <p className="text-sm text-visa-gray-500 mt-1">
                This system prompt is sent to Claude at the start of the <code className="bg-visa-gray-100 px-1 rounded">{editingKey}</code> step. Changes apply to all future runs.
              </p>
            </div>
            <div className="flex-1 p-6 overflow-auto">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-visa-gray-500 uppercase tracking-wide">System Prompt</span>
                <span className="text-xs text-visa-gray-400">~{Math.round(editValue.length / 4)} tokens</span>
              </div>
              <textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="w-full h-80 border border-visa-gray-300 rounded-xl px-4 py-3 text-sm font-mono bg-visa-gray-50 leading-relaxed resize-y focus:ring-2 focus:ring-visa-navy/20 focus:border-visa-navy outline-none transition"
                spellCheck={false}
              />
            </div>
            <div className="p-6 border-t border-visa-gray-200 bg-visa-gray-50/50 rounded-b-2xl flex justify-between">
              <button
                onClick={() => {
                  const def = prompts.find((p) => p.key === editingKey)?.default_value;
                  if (def) setEditValue(def);
                }}
                className="px-4 py-2 text-sm text-visa-gray-600 hover:text-visa-navy transition"
              >
                Restore Default Text
              </button>
              <div className="flex gap-3">
                <button onClick={() => setEditingKey(null)}
                  className="px-5 py-2.5 text-sm font-medium text-visa-gray-600 bg-white border border-visa-gray-300 rounded-xl hover:bg-visa-gray-50 transition">
                  Cancel
                </button>
                <button onClick={handleSave} disabled={saving}
                  className="px-5 py-2.5 text-sm font-medium text-white bg-visa-navy rounded-xl hover:bg-visa-blue disabled:opacity-50 transition">
                  {saving ? "Saving..." : "Save Prompt"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ============================================================================
// LLM Usage Dashboard
// ============================================================================

function LLMUsageSection({ stats, loading, error, onRetry }: {
  stats: LLMStats | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const [expandedCall, setExpandedCall] = useState<number | null>(null);

  if (loading) return <SectionSpinner text="Loading LLM usage data..." />;
  if (error) return <ErrorBanner message={error} onRetry={onRetry} />;

  if (!stats || stats.total_calls === 0) {
    return (
      <EmptyState
        icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
        title="No LLM calls yet"
        subtitle="Run the pipeline to see LLM usage statistics. Stats are only available for active sessions (not persisted across server restarts)."
      />
    );
  }

  const labelEntries = Object.entries(stats.per_label).sort((a, b) => b[1].cost_usd - a[1].cost_usd);
  const maxCost = Math.max(...labelEntries.map(([, v]) => v.cost_usd), 0.0001);

  const labelColors: Record<string, string> = {
    "Schema Mapping": "bg-blue-500",
    "Relationship Discovery": "bg-purple-500",
    "SQL Generation": "bg-green-500",
    "Chat Response": "bg-amber-500",
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Total Calls" value={String(stats.total_calls)} />
        <StatCard label="Input Tokens" value={stats.total_input_tokens.toLocaleString()} />
        <StatCard label="Output Tokens" value={stats.total_output_tokens.toLocaleString()} />
        <StatCard label="Total Cost" value={`$${stats.total_cost_usd.toFixed(4)}`} highlight />
        <StatCard label="Total Duration" value={`${(stats.total_duration_ms / 1000).toFixed(1)}s`} />
      </div>

      {/* Per-Label Breakdown */}
      <div className="bg-white rounded-xl border border-visa-gray-200 p-5">
        <h4 className="text-sm font-bold text-visa-navy mb-4">Cost by Pipeline Step</h4>
        <div className="space-y-3">
          {labelEntries.map(([label, data]) => {
            const pct = (data.cost_usd / maxCost) * 100;
            const barColor = labelColors[label] || (label.includes("Research") ? "bg-pink-500" : label.includes("Retry") ? "bg-orange-500" : "bg-gray-400");
            return (
              <div key={label} className="flex items-center gap-4">
                <div className="w-40 flex-shrink-0">
                  <span className="text-xs font-medium text-visa-gray-700 truncate block">{label}</span>
                  <span className="text-[10px] text-visa-gray-400">{data.calls} calls</span>
                </div>
                <div className="flex-1">
                  <div className="h-6 bg-visa-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full ${barColor} rounded-full transition-all duration-500`} style={{ width: `${Math.max(pct, 2)}%` }} />
                  </div>
                </div>
                <div className="w-24 text-right flex-shrink-0">
                  <span className="text-xs font-semibold text-visa-navy">${data.cost_usd.toFixed(4)}</span>
                  <span className="block text-[10px] text-visa-gray-400">
                    {(data.input_tokens + data.output_tokens).toLocaleString()} tok
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Per-Job Breakdown */}
      {stats.per_job.length > 0 && (
        <div className="bg-white rounded-xl border border-visa-gray-200 p-5">
          <h4 className="text-sm font-bold text-visa-navy mb-4">Usage by Job</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-visa-gray-200">
                  <th className="text-left py-2 px-3 font-semibold text-visa-gray-600">Job ID</th>
                  <th className="text-right py-2 px-3 font-semibold text-visa-gray-600">Calls</th>
                  <th className="text-right py-2 px-3 font-semibold text-visa-gray-600">Input Tokens</th>
                  <th className="text-right py-2 px-3 font-semibold text-visa-gray-600">Output Tokens</th>
                  <th className="text-right py-2 px-3 font-semibold text-visa-gray-600">Cost</th>
                  <th className="text-right py-2 px-3 font-semibold text-visa-gray-600">Duration</th>
                </tr>
              </thead>
              <tbody>
                {stats.per_job.map((job) => (
                  <tr key={job.job_id} className="border-b border-visa-gray-100 hover:bg-visa-gray-50">
                    <td className="py-2 px-3 font-mono text-visa-navy font-medium">{job.job_id}</td>
                    <td className="py-2 px-3 text-right">{job.calls}</td>
                    <td className="py-2 px-3 text-right">{job.input_tokens.toLocaleString()}</td>
                    <td className="py-2 px-3 text-right">{job.output_tokens.toLocaleString()}</td>
                    <td className="py-2 px-3 text-right font-semibold text-visa-gold">${job.cost_usd.toFixed(4)}</td>
                    <td className="py-2 px-3 text-right">{(job.duration_ms / 1000).toFixed(1)}s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Calls */}
      {stats.recent_calls.length > 0 && (
        <div className="bg-white rounded-xl border border-visa-gray-200 p-5">
          <h4 className="text-sm font-bold text-visa-navy mb-4">Recent LLM Calls</h4>
          <div className="space-y-2">
            {stats.recent_calls.map((call) => {
              const isOpen = expandedCall === call.call_id;
              return (
                <div key={`${call.call_id}-${call.timestamp}`} className="border border-visa-gray-200 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setExpandedCall(isOpen ? null : call.call_id)}
                    className="w-full flex items-center gap-3 p-3 text-left hover:bg-visa-gray-50 transition"
                  >
                    <LabelChip label={call.label || call.method} />
                    <span className="text-xs text-visa-gray-500 flex-1">{call.model}</span>
                    <span className="text-xs text-visa-gray-500">{call.input_tokens.toLocaleString()} in</span>
                    <span className="text-xs text-visa-gray-500">{call.output_tokens.toLocaleString()} out</span>
                    <span className="text-xs font-semibold text-visa-gold">${call.cost_usd.toFixed(4)}</span>
                    <span className="text-xs text-visa-gray-400">{(call.duration_ms / 1000).toFixed(1)}s</span>
                    {call.error && <span className="text-xs text-red-600 font-semibold">ERR</span>}
                    <svg className={`w-3.5 h-3.5 text-visa-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {isOpen && (
                    <div className="border-t border-visa-gray-100 p-3 space-y-3">
                      <PromptBlock label="System Prompt" content={call.system_prompt} />
                      <PromptBlock label="User Prompt" content={call.user_prompt} />
                      <PromptBlock label="Output" content={call.error ? `ERROR: ${call.error}` : call.output} isOutput />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-visa-gray-200 p-4 text-center">
      <div className={`text-xl font-bold ${highlight ? "text-visa-gold" : "text-visa-navy"}`}>{value}</div>
      <div className="text-[10px] text-visa-gray-500 mt-1 uppercase tracking-wide font-semibold">{label}</div>
    </div>
  );
}

function LabelChip({ label }: { label: string }) {
  const colors: Record<string, string> = {
    "Schema Mapping": "bg-blue-100 text-blue-700 border-blue-200",
    "Relationship Discovery": "bg-purple-100 text-purple-700 border-purple-200",
    "SQL Generation": "bg-green-100 text-green-700 border-green-200",
    "Chat Response": "bg-amber-100 text-amber-700 border-amber-200",
  };
  const color = colors[label] || (label.includes("Research") ? "bg-pink-100 text-pink-700 border-pink-200" : label.includes("Retry") ? "bg-orange-100 text-orange-700 border-orange-200" : "bg-gray-100 text-gray-600 border-gray-200");
  return (
    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${color}`}>
      {label}
    </span>
  );
}

function PromptBlock({ label, content, isOutput }: { label: string; content: string; isOutput?: boolean }) {
  return (
    <div>
      <span className="text-[10px] font-semibold text-visa-gray-500 uppercase tracking-wide">{label}</span>
      <pre className={`mt-1 p-3 rounded-lg text-xs font-mono whitespace-pre-wrap leading-relaxed max-h-48 overflow-auto ${
        isOutput ? "bg-visa-gray-900 text-green-400" : "bg-visa-gray-50 text-visa-gray-700 border border-visa-gray-200"
      }`}>
        {content || "(empty)"}
      </pre>
    </div>
  );
}

// ============================================================================
// Main Settings Page
// ============================================================================

// ============================================================================
// Mapping Templates Section
// ============================================================================

type TemplateDetailTab = "mapping" | "sql" | "instructions" | "violations";

function TemplateDetailsPanel({ fingerprint }: { fingerprint: string }) {
  const [detail, setDetail] = useState<MappingTemplateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TemplateDetailTab>("mapping");

  useEffect(() => {
    setLoading(true);
    setError(null);
    getMappingTemplateDetail(fingerprint)
      .then((d) => setDetail(d))
      .catch((e) => setError(`Failed to load details: ${e}`))
      .finally(() => setLoading(false));
  }, [fingerprint]);

  if (loading) {
    return (
      <div className="py-6 text-center">
        <svg className="animate-spin h-5 w-5 mx-auto text-visa-navy mb-2" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p className="text-xs text-visa-gray-500">Loading template details...</p>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="py-4 text-center text-sm text-red-600">
        {error || "Template not found"}
      </div>
    );
  }

  const tabs: { key: TemplateDetailTab; label: string; badge?: string }[] = [
    {
      key: "mapping",
      label: "Schema Mapping",
      badge: detail.schema_mapping
        ? `${detail.schema_mapping.mappings.filter((m) => m.source_column || m.is_derived).length}/${detail.schema_mapping.mappings.length}`
        : undefined,
    },
    {
      key: "sql",
      label: "SQL Query",
      badge: detail.generated_sql ? "Cached" : undefined,
    },
    {
      key: "instructions",
      label: "User Instructions",
      badge: detail.user_instructions ? "Set" : undefined,
    },
    {
      key: "violations",
      label: "Violation Rules",
      badge: detail.selected_violations?.length
        ? `${detail.selected_violations.length}`
        : undefined,
    },
  ];

  return (
    <div className="mt-4 border-t border-visa-gray-200 pt-4">
      {/* Detail Tabs */}
      <div className="flex gap-1 mb-3 flex-wrap">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
              activeTab === tab.key
                ? "bg-visa-navy text-white"
                : "bg-visa-gray-100 text-visa-gray-600 hover:bg-visa-gray-200"
            }`}
          >
            {tab.label}
            {tab.badge && (
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] ${
                activeTab === tab.key
                  ? "bg-white/20 text-white"
                  : "bg-visa-gray-200 text-visa-gray-500"
              }`}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Schema Mapping */}
      {activeTab === "mapping" && detail.schema_mapping && (
        <SchemaMapEditor mapping={detail.schema_mapping} editable={false} />
      )}
      {activeTab === "mapping" && !detail.schema_mapping && (
        <p className="text-sm text-visa-gray-500 py-4 text-center">No schema mapping data stored.</p>
      )}

      {/* SQL Query */}
      {activeTab === "sql" && (
        <div className="bg-visa-gray-50 rounded-lg p-4">
          {detail.generated_sql ? (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h5 className="text-xs font-semibold text-visa-navy flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                  Cached AMMF Transformation SQL
                </h5>
                <span className="text-[10px] px-2 py-0.5 bg-green-100 text-green-700 rounded-full border border-green-200">
                  Reused on matching runs
                </span>
              </div>
              <pre className="mt-2 p-4 bg-visa-gray-900 text-visa-gray-100 rounded-lg text-xs font-mono overflow-x-auto max-h-96 overflow-y-auto whitespace-pre-wrap">
                {detail.generated_sql}
              </pre>
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-sm text-visa-gray-500">
                No SQL query cached yet.
              </p>
              <p className="text-xs text-visa-gray-400 mt-1">
                SQL is automatically saved after the first successful pipeline run using this template.
                Future runs with matching data will reuse this SQL, skipping the LLM query generation step.
              </p>
            </div>
          )}
        </div>
      )}

      {/* User Instructions */}
      {activeTab === "instructions" && (
        <div className="bg-visa-gray-50 rounded-lg p-4">
          {detail.user_instructions ? (
            <div>
              <h5 className="text-xs font-semibold text-visa-navy mb-2 flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                SQL Generation Notes
              </h5>
              <p className="text-sm text-visa-gray-700 whitespace-pre-wrap">{detail.user_instructions}</p>
            </div>
          ) : (
            <p className="text-sm text-visa-gray-500 text-center py-2">
              No user instructions were saved with this template.
            </p>
          )}
        </div>
      )}

      {/* Selected Violations */}
      {activeTab === "violations" && (
        <div className="bg-visa-gray-50 rounded-lg p-4">
          {detail.selected_violations && detail.selected_violations.length > 0 ? (
            <div>
              <h5 className="text-xs font-semibold text-visa-navy mb-2">
                {detail.selected_violations.length} violation rule{detail.selected_violations.length !== 1 ? "s" : ""} selected
              </h5>
              <div className="flex flex-wrap gap-1.5">
                {detail.selected_violations.map((v) => (
                  <span
                    key={v}
                    className="px-2 py-1 text-xs bg-white border border-visa-gray-200 rounded-lg text-visa-gray-700 font-medium"
                  >
                    {v}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-visa-gray-500 text-center py-2">
              No violation rules were saved with this template.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function MappingTemplatesSection({ onReload }: { onReload: () => void }) {
  const [templates, setTemplates] = useState<MappingTemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [expandedFp, setExpandedFp] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTemplates(await getMappingTemplates());
    } catch (e) {
      setError(`Failed to load templates: ${e}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (fp: string) => {
    if (!confirm("Delete this mapping template? Future runs with this data structure will require manual review again.")) return;
    setDeleting(fp);
    try {
      await deleteMappingTemplate(fp);
      setTemplates((prev) => prev.filter((t) => t.fingerprint !== fp));
      setToast("Template deleted");
      setTimeout(() => setToast(null), 3000);
    } catch (e) {
      setError(`Failed to delete: ${e}`);
    } finally {
      setDeleting(null);
    }
  };

  const handleResetAll = async () => {
    if (!confirm("Delete ALL mapping templates? This cannot be undone.")) return;
    try {
      await resetMappingTemplates();
      setTemplates([]);
      setToast("All templates deleted");
      setTimeout(() => setToast(null), 3000);
    } catch (e) {
      setError(`Failed to reset: ${e}`);
    }
  };

  if (loading) return <SectionSpinner text="Loading mapping templates..." />;
  if (error) return <ErrorBanner message={error} onRetry={load} />;

  if (templates.length === 0) {
    return (
      <EmptyState
        icon={
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
          </svg>
        }
        title="No saved mapping templates"
        subtitle="Templates are created when you approve a schema mapping and check 'Save as template'"
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Reset All button */}
      <div className="flex justify-end">
        <button
          onClick={handleResetAll}
          className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition"
        >
          Delete All Templates
        </button>
      </div>

      {/* Template cards */}
      <div className="space-y-3">
        {templates.map((t) => (
          <div key={t.fingerprint} className="bg-white rounded-xl border border-visa-gray-200 p-5 hover:border-visa-gray-300 transition">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold text-visa-navy text-sm truncate">{t.name}</h4>
                  <span className="px-2 py-0.5 text-[10px] font-mono bg-visa-gray-100 text-visa-gray-500 rounded">
                    {t.fingerprint.slice(0, 8)}
                  </span>
                </div>
                <p className="text-xs text-visa-gray-500 mt-1">
                  Created {new Date(t.created_at).toLocaleDateString()} at{" "}
                  {new Date(t.created_at).toLocaleTimeString()}
                </p>

                {/* Table summary */}
                <div className="mt-3 flex flex-wrap gap-2">
                  {Object.entries(t.table_summary).map(([table, cols]) => (
                    <span
                      key={table}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded-lg border border-blue-100"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      {table}
                      <span className="text-blue-500">({(cols as string[]).length} cols)</span>
                    </span>
                  ))}
                </div>

                {/* Metadata badges */}
                <div className="mt-2 flex flex-wrap gap-2">
                  {t.has_sql && (
                    <span className="text-[10px] px-2 py-0.5 bg-green-50 text-green-700 rounded-full border border-green-200">
                      Cached SQL
                    </span>
                  )}
                  {t.has_user_instructions && (
                    <span className="text-[10px] px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full border border-amber-100">
                      Has SQL instructions
                    </span>
                  )}
                  {t.violation_count != null && t.violation_count > 0 && (
                    <span className="text-[10px] px-2 py-0.5 bg-visa-gray-50 text-visa-gray-600 rounded-full border border-visa-gray-200">
                      {t.violation_count} violation rules
                    </span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setExpandedFp(expandedFp === t.fingerprint ? null : t.fingerprint)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition flex items-center gap-1 ${
                    expandedFp === t.fingerprint
                      ? "bg-visa-navy text-white"
                      : "bg-visa-gray-100 text-visa-gray-700 hover:bg-visa-gray-200"
                  }`}
                >
                  Details
                  <svg className={`w-3 h-3 transition-transform ${expandedFp === t.fingerprint ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <button
                  onClick={() => handleDelete(t.fingerprint)}
                  disabled={deleting === t.fingerprint}
                  className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition disabled:opacity-50"
                >
                  {deleting === t.fingerprint ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>

            {/* Expandable Details Panel */}
            {expandedFp === t.fingerprint && (
              <TemplateDetailsPanel fingerprint={t.fingerprint} />
            )}
          </div>
        ))}
      </div>

      {toast && <SuccessToast message={toast} />}
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<SettingsTab>("rules");

  // Independent loading states for each section
  const [dqRules, setDqRules] = useState<DQRule[]>([]);
  const [dqLoading, setDqLoading] = useState(true);
  const [dqError, setDqError] = useState<string | null>(null);

  const [violationRules, setViolationRules] = useState<ConfigViolationRule[]>([]);
  const [vrLoading, setVrLoading] = useState(true);
  const [vrError, setVrError] = useState<string | null>(null);

  const [prompts, setPrompts] = useState<PromptConfig[]>([]);
  const [promptsLoading, setPromptsLoading] = useState(true);
  const [promptsError, setPromptsError] = useState<string | null>(null);

  const [llmStats, setLlmStats] = useState<LLMStats | null>(null);
  const [llmLoading, setLlmLoading] = useState(true);
  const [llmError, setLlmError] = useState<string | null>(null);

  const [templatesKey, setTemplatesKey] = useState(0);

  const loadDQ = useCallback(async () => {
    setDqLoading(true);
    setDqError(null);
    try {
      setDqRules(await getDQRules());
    } catch (e) {
      setDqError(`Failed to load DQ rules: ${e}`);
    } finally {
      setDqLoading(false);
    }
  }, []);

  const loadVR = useCallback(async () => {
    setVrLoading(true);
    setVrError(null);
    try {
      setViolationRules(await getConfigViolationRules());
    } catch (e) {
      setVrError(`Failed to load violation rules: ${e}`);
    } finally {
      setVrLoading(false);
    }
  }, []);

  const loadPrompts = useCallback(async () => {
    setPromptsLoading(true);
    setPromptsError(null);
    try {
      setPrompts(await getPrompts());
    } catch (e) {
      setPromptsError(`Failed to load prompts: ${e}`);
    } finally {
      setPromptsLoading(false);
    }
  }, []);

  const loadLLM = useCallback(async () => {
    setLlmLoading(true);
    setLlmError(null);
    try {
      setLlmStats(await getLLMStats());
    } catch (e) {
      setLlmError(`Failed to load LLM stats: ${e}`);
    } finally {
      setLlmLoading(false);
    }
  }, []);

  // Load all sections independently on mount
  useEffect(() => {
    loadDQ();
    loadVR();
    loadPrompts();
    loadLLM();
  }, [loadDQ, loadVR, loadPrompts, loadLLM]);

  return (
    <div className="max-w-6xl mx-auto space-y-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-visa-navy">Settings</h1>
          <p className="text-sm text-visa-gray-500 mt-0.5">
            Configure compliance rules, AI prompts, and monitor LLM usage
          </p>
        </div>
        <button
          onClick={() => router.push("/")}
          className="px-4 py-2 text-sm font-medium bg-visa-gray-100 text-visa-gray-700 rounded-xl hover:bg-visa-gray-200 transition flex items-center gap-1.5"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Home
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-visa-gray-200 mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? "border-visa-navy text-visa-navy"
                : "border-transparent text-visa-gray-500 hover:text-visa-gray-700 hover:border-visa-gray-300"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "rules" && (
        <div className="space-y-8">
          {/* Violation Rules */}
          <section>
            <div className="mb-4">
              <h2 className="text-lg font-bold text-visa-navy">Violation Rules</h2>
              <p className="text-sm text-visa-gray-500 mt-0.5">
                SQL-based rules that check AMMF output for Visa compliance violations. You can edit, add, or disable rules.
              </p>
            </div>
            <ViolationRulesSection
              rules={violationRules}
              loading={vrLoading}
              error={vrError}
              onRetry={loadVR}
              onReload={loadVR}
            />
          </section>

          {/* DQ Rules */}
          <section>
            <div className="mb-4">
              <h2 className="text-lg font-bold text-visa-navy">Data Quality Checks</h2>
              <p className="text-sm text-visa-gray-500 mt-0.5">
                Checks that run automatically on uploaded data during ingestion. You can edit thresholds and severity levels.
              </p>
            </div>
            <DQRulesSection rules={dqRules} loading={dqLoading} error={dqError} onRetry={loadDQ} onReload={loadDQ} />
          </section>
        </div>
      )}

      {activeTab === "prompts" && (
        <section>
          <div className="mb-4">
            <h2 className="text-lg font-bold text-visa-navy">AI System Prompts</h2>
            <p className="text-sm text-visa-gray-500 mt-0.5">
              Customize the system prompts sent to Claude at each pipeline step. Changes apply to all future runs.
            </p>
          </div>
          <LLMPromptsSection
            prompts={prompts}
            loading={promptsLoading}
            error={promptsError}
            onRetry={loadPrompts}
            onReload={loadPrompts}
          />
        </section>
      )}

      {activeTab === "llm" && (
        <section>
          <div className="mb-4">
            <h2 className="text-lg font-bold text-visa-navy">LLM Usage & Costs</h2>
            <p className="text-sm text-visa-gray-500 mt-0.5">
              Aggregate Claude API usage across all active pipeline runs. Token counts, costs, and call details.
            </p>
          </div>
          <LLMUsageSection stats={llmStats} loading={llmLoading} error={llmError} onRetry={loadLLM} />
        </section>
      )}

      {activeTab === "templates" && (
        <section>
          <div className="mb-4">
            <h2 className="text-lg font-bold text-visa-navy">Mapping Templates</h2>
            <p className="text-sm text-visa-gray-500 mt-0.5">
              Saved schema mappings that auto-apply when uploaded data matches. Templates are keyed by data structure (table names + column names).
            </p>
          </div>
          <MappingTemplatesSection key={templatesKey} onReload={() => setTemplatesKey((k) => k + 1)} />
        </section>
      )}
    </div>
  );
}
