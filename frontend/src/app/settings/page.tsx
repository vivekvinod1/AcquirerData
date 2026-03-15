"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  getDQRules,
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
  type DQRule,
  type ConfigViolationRule,
  type PromptConfig,
  type TestRuleResult,
  type ResolutionStrategy,
} from "@/lib/api";

/* ─── Severity badge ─── */
function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    critical: "bg-red-100 text-red-700",
    warning: "bg-amber-100 text-amber-700",
    info: "bg-blue-100 text-blue-700",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[severity] || "bg-gray-100 text-gray-700"}`}>
      {severity}
    </span>
  );
}

/* ─── DQ Rules Section (read-only) ─── */
function DQRulesSection({ rules }: { rules: DQRule[] }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-visa-gray-200 p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-visa-navy">Data Quality Checks</h3>
        <p className="text-sm text-visa-gray-500 mt-1">
          These checks run automatically on uploaded data during the ingestion phase.
          They are system-defined and cannot be modified.
        </p>
      </div>
      <div className="space-y-3">
        {rules.map((rule) => (
          <div key={rule.id} className="flex items-start gap-4 p-4 bg-visa-gray-50 rounded-lg border border-visa-gray-200">
            <div className="flex-shrink-0 w-12 h-8 bg-visa-navy text-white rounded flex items-center justify-center text-xs font-bold">
              {rule.id}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-visa-navy">{rule.name}</span>
                <SeverityBadge severity={rule.severity} />
              </div>
              <p className="text-sm text-visa-gray-600 mt-1">{rule.description}</p>
              <p className="text-xs text-visa-gray-400 mt-1">Threshold: {rule.threshold}</p>
            </div>
            <div className="flex-shrink-0">
              <span className="px-2 py-1 bg-gray-100 text-gray-500 rounded text-xs">System</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Violation Rule Editor Modal ─── */
function RuleEditorModal({
  rule,
  isNew,
  onSave,
  onCancel,
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
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-visa-gray-200">
          <h3 className="text-lg font-semibold text-visa-navy">
            {isNew ? "Add New Violation Rule" : `Edit Rule ${rule?.id}`}
          </h3>
        </div>
        <div className="p-6 space-y-4">
          {isNew && (
            <div>
              <label className="block text-sm font-medium text-visa-gray-700 mb-1">Rule ID</label>
              <input
                type="text"
                value={id}
                onChange={(e) => setId(e.target.value.toUpperCase())}
                className="w-full border border-visa-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="e.g., V14"
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-visa-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-visa-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Rule name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-visa-gray-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full border border-visa-gray-300 rounded-lg px-3 py-2 text-sm"
              rows={2}
              placeholder="What does this rule check?"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-visa-gray-700 mb-1">
              Target Columns <span className="text-visa-gray-400 font-normal">(comma-separated)</span>
            </label>
            <input
              type="text"
              value={columns}
              onChange={(e) => setColumns(e.target.value)}
              className="w-full border border-visa-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="e.g., DBAName, LegalName, Street"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-visa-gray-700 mb-1">
              SQL Query <span className="text-visa-gray-400 font-normal">(DuckDB dialect, table: ammf_output)</span>
            </label>
            <textarea
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              className="w-full border border-visa-gray-300 rounded-lg px-3 py-2 text-sm font-mono bg-visa-gray-50"
              rows={12}
              placeholder={`SELECT *, '${id || "Vxx"}' AS violation_id\nFROM ammf_output\nWHERE ...`}
            />
            <p className="text-xs text-visa-gray-400 mt-1">
              Query must return rows that violate the rule from the <code>ammf_output</code> table.
              Include a <code>violation_id</code> column with the rule ID.
            </p>
          </div>
        </div>
        <div className="p-6 border-t border-visa-gray-200 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-visa-gray-600 bg-visa-gray-100 rounded-lg hover:bg-visa-gray-200"
          >
            Cancel
          </button>
          <button
            onClick={() =>
              onSave({
                id: isNew ? id : rule?.id || "",
                name,
                description,
                columns: columns.split(",").map((c) => c.trim()).filter(Boolean),
                sql,
              })
            }
            disabled={!name || !sql || (isNew && !id)}
            className="px-4 py-2 text-sm text-white bg-visa-navy rounded-lg hover:bg-visa-blue disabled:opacity-50"
          >
            {isNew ? "Create Rule" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── LLM Prompts Section ─── */
function LLMPromptsSection({
  prompts,
  onReload,
}: {
  prompts: PromptConfig[];
  onReload: () => void;
}) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

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
      onReload();
    } catch (err) {
      alert(`Failed to reset: ${err}`);
    }
  };

  const handleResetAll = async () => {
    if (!confirm("Reset ALL prompts to factory defaults?")) return;
    try {
      await resetAllPrompts();
      onReload();
    } catch {
      // ignore
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-visa-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-visa-navy">LLM Prompts</h3>
          <p className="text-sm text-visa-gray-500 mt-1">
            Customize the system prompts sent to Claude at each pipeline step.
            Changes apply to all future runs.
          </p>
        </div>
        <button
          onClick={handleResetAll}
          className="px-3 py-1.5 text-xs text-visa-gray-600 bg-visa-gray-100 rounded-lg hover:bg-visa-gray-200"
        >
          Reset All
        </button>
      </div>

      <div className="space-y-4">
        {prompts.map((p) => (
          <div key={p.key} className="border border-visa-gray-200 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between p-4 bg-visa-gray-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-visa-navy text-white rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-visa-navy">{p.name}</span>
                    <code className="text-xs bg-visa-gray-200 text-visa-gray-600 px-1.5 py-0.5 rounded">
                      {p.key}
                    </code>
                    {p.is_custom && (
                      <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-medium">
                        Customized
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-visa-gray-500 mt-0.5">
                    {p.value.slice(0, 120)}...
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                {p.is_custom && (
                  <button
                    onClick={() => handleReset(p.key)}
                    className="px-3 py-1.5 text-xs text-visa-gray-600 bg-visa-gray-100 rounded hover:bg-visa-gray-200"
                  >
                    Reset
                  </button>
                )}
                <button
                  onClick={() => handleEdit(p)}
                  className="px-3 py-1.5 text-xs text-white bg-visa-navy rounded hover:bg-visa-blue"
                >
                  Edit
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Edit Modal */}
      {editingKey && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-visa-gray-200">
              <h3 className="text-lg font-semibold text-visa-navy">
                Edit Prompt: {prompts.find((p) => p.key === editingKey)?.name}
              </h3>
              <p className="text-sm text-visa-gray-500 mt-1">
                This system prompt is sent to Claude at the start of the <code className="bg-visa-gray-100 px-1 rounded">{editingKey}</code> step.
              </p>
            </div>
            <div className="flex-1 p-6 overflow-auto">
              <textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="w-full h-80 border border-visa-gray-300 rounded-lg px-4 py-3 text-sm font-mono bg-visa-gray-50 leading-relaxed resize-y"
                spellCheck={false}
              />
            </div>
            <div className="p-6 border-t border-visa-gray-200 flex justify-between">
              <button
                onClick={() => {
                  const def = prompts.find((p) => p.key === editingKey)?.default_value;
                  if (def) setEditValue(def);
                }}
                className="px-4 py-2 text-sm text-visa-gray-600 hover:text-visa-navy"
              >
                Restore Default
              </button>
              <div className="flex gap-3">
                <button
                  onClick={() => setEditingKey(null)}
                  className="px-4 py-2 text-sm text-visa-gray-600 bg-visa-gray-100 rounded-lg hover:bg-visa-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 text-sm text-white bg-visa-navy rounded-lg hover:bg-visa-blue disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save Prompt"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Resolution Strategy Modal ─── */
function ResolutionStrategyModal({
  strategy,
  onClose,
}: {
  strategy: ResolutionStrategy;
  onClose: () => void;
}) {
  const approachLabels: Record<string, { label: string; color: string }> = {
    auto_fix: { label: "Auto-Fixable", color: "bg-green-100 text-green-700" },
    web_research: { label: "Web Research Needed", color: "bg-blue-100 text-blue-700" },
    manual_review: { label: "Manual Review Required", color: "bg-amber-100 text-amber-700" },
  };
  const approach = approachLabels[strategy.approach] || { label: strategy.approach, color: "bg-gray-100 text-gray-700" };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-visa-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-visa-navy">
                Resolution Strategy: {strategy.rule_id}
              </h3>
              <p className="text-sm text-visa-gray-500 mt-1">AI-generated analysis of how to resolve violations</p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${approach.color}`}>
                {approach.label}
              </span>
              <span className="text-sm font-medium text-visa-gray-600">
                {Math.round(strategy.confidence * 100)}% confidence
              </span>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Root Cause */}
          <div>
            <h4 className="text-sm font-semibold text-visa-navy mb-2 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Root Cause
            </h4>
            <p className="text-sm text-visa-gray-700 bg-visa-gray-50 rounded-lg p-4 leading-relaxed">
              {strategy.root_cause}
            </p>
          </div>

          {/* Fix Explanation */}
          <div>
            <h4 className="text-sm font-semibold text-visa-navy mb-2 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              Resolution Steps
            </h4>
            <p className="text-sm text-visa-gray-700 bg-visa-gray-50 rounded-lg p-4 leading-relaxed whitespace-pre-line">
              {strategy.fix_explanation}
            </p>
          </div>

          {/* Fix SQL */}
          {strategy.fix_sql && (
            <div>
              <h4 className="text-sm font-semibold text-visa-navy mb-2 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
                Fix SQL (DuckDB)
              </h4>
              <pre className="text-xs font-mono bg-visa-gray-900 text-green-400 rounded-lg p-4 overflow-x-auto max-h-64 overflow-y-auto leading-relaxed">
                {strategy.fix_sql}
              </pre>
              <p className="text-xs text-visa-gray-400 mt-2">
                This SQL can be applied to the <code>ammf_output</code> table to fix the violations.
                Review carefully before executing.
              </p>
            </div>
          )}

          {/* Web Research Guidance */}
          {strategy.web_research_guidance && (
            <div>
              <h4 className="text-sm font-semibold text-blue-700 mb-2 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Web Research Guidance
              </h4>
              <p className="text-sm text-visa-gray-700 bg-blue-50 rounded-lg p-4 leading-relaxed whitespace-pre-line">
                {strategy.web_research_guidance}
              </p>
            </div>
          )}

          {/* Manual Review Guidance */}
          {strategy.manual_review_guidance && (
            <div>
              <h4 className="text-sm font-semibold text-amber-700 mb-2 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                Manual Review Required
              </h4>
              <p className="text-sm text-visa-gray-700 bg-amber-50 rounded-lg p-4 leading-relaxed whitespace-pre-line">
                {strategy.manual_review_guidance}
              </p>
            </div>
          )}

          {/* Caveats */}
          {strategy.caveats && strategy.caveats.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-visa-gray-600 mb-2">Caveats</h4>
              <ul className="text-sm text-visa-gray-600 space-y-1">
                {strategy.caveats.map((c, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-visa-gray-400 mt-0.5">-</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-visa-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-white bg-visa-navy rounded-lg hover:bg-visa-blue"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Settings Page ─── */
export default function SettingsPage() {
  const router = useRouter();
  const [dqRules, setDqRules] = useState<DQRule[]>([]);
  const [violationRules, setViolationRules] = useState<ConfigViolationRule[]>([]);
  const [prompts, setPrompts] = useState<PromptConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRule, setEditingRule] = useState<ConfigViolationRule | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [expandedSql, setExpandedSql] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestRuleResult>>({});
  const [testingRule, setTestingRule] = useState<string | null>(null);
  const [resolutionStrategy, setResolutionStrategy] = useState<ResolutionStrategy | null>(null);
  const [generatingStrategy, setGeneratingStrategy] = useState<string | null>(null);

  const loadRules = async () => {
    try {
      const [dq, vr, pr] = await Promise.all([getDQRules(), getConfigViolationRules(), getPrompts()]);
      setDqRules(dq);
      setViolationRules(vr);
      setPrompts(pr);
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRules();
  }, []);

  const handleSaveEdit = async (data: { id: string; name: string; description: string; columns: string[]; sql: string }) => {
    try {
      await updateViolationRule(data.id, {
        name: data.name,
        description: data.description,
        columns: data.columns,
        sql: data.sql,
      });
      setEditingRule(null);
      loadRules();
    } catch (err) {
      alert(`Failed to save: ${err}`);
    }
  };

  const handleCreate = async (data: { id: string; name: string; description: string; columns: string[]; sql: string }) => {
    try {
      await createViolationRule(data);
      setIsCreating(false);
      loadRules();
    } catch (err) {
      alert(`Failed to create: ${err}`);
    }
  };

  const handleDelete = async (ruleId: string, isCustom: boolean) => {
    const action = isCustom ? "delete" : "reset to default";
    if (!confirm(`Are you sure you want to ${action} rule ${ruleId}?`)) return;
    try {
      await deleteViolationRule(ruleId);
      loadRules();
    } catch (err) {
      alert(`Failed: ${err}`);
    }
  };

  const handleToggle = async (rule: ConfigViolationRule) => {
    try {
      await updateViolationRule(rule.id, { enabled: !rule.enabled });
      loadRules();
    } catch {
      // ignore
    }
  };

  const handleResetAll = async () => {
    if (!confirm("Reset ALL violation rules to factory defaults? This removes all custom rules and edits.")) return;
    try {
      await resetViolationRules();
      loadRules();
    } catch {
      // ignore
    }
  };

  const handleTestRule = async (rule: ConfigViolationRule) => {
    setTestingRule(rule.id);
    try {
      const result = await testViolationRule(rule.sql);
      setTestResults((prev) => ({ ...prev, [rule.id]: result }));
      // Auto-expand SQL section to show results
      setExpandedSql(rule.id);
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [rule.id]: {
          status: "error",
          error: `${err}`,
          total_rows_flagged: 0,
          total_ammf_rows: 0,
          sample_rows: [],
          columns: [],
        },
      }));
      setExpandedSql(rule.id);
    } finally {
      setTestingRule(null);
    }
  };

  const handleGenerateStrategy = async (rule: ConfigViolationRule) => {
    setGeneratingStrategy(rule.id);
    try {
      const sampleRows = testResults[rule.id]?.sample_rows;
      const result = await generateResolutionStrategy(
        rule.id,
        rule.name,
        rule.description,
        rule.columns,
        rule.sql,
        sampleRows as Record<string, unknown>[]
      );
      setResolutionStrategy(result);
    } catch (err) {
      alert(`Failed to generate strategy: ${err}`);
    } finally {
      setGeneratingStrategy(null);
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-visa-gray-500">Loading configuration...</div>;
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-visa-navy">Settings</h2>
          <p className="text-sm text-visa-gray-500">
            Configure data quality checks, violation rules, and LLM prompts
          </p>
        </div>
        <button
          onClick={() => router.push("/")}
          className="px-4 py-2 text-sm bg-visa-gray-100 text-visa-gray-700 rounded-lg hover:bg-visa-gray-200"
        >
          ← Back to Home
        </button>
      </div>

      {/* DQ Rules */}
      <DQRulesSection rules={dqRules} />

      {/* Violation Rules */}
      <div className="bg-white rounded-lg shadow-sm border border-visa-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-visa-navy">Violation Rules</h3>
            <p className="text-sm text-visa-gray-500 mt-1">
              These SQL-based rules check the AMMF output for Visa compliance violations.
              You can edit existing rules, add custom ones, or disable rules.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleResetAll}
              className="px-3 py-1.5 text-xs text-visa-gray-600 bg-visa-gray-100 rounded-lg hover:bg-visa-gray-200"
            >
              Reset All
            </button>
            <button
              onClick={() => setIsCreating(true)}
              className="px-3 py-1.5 text-xs text-white bg-visa-navy rounded-lg hover:bg-visa-blue flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Rule
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {violationRules.map((rule) => (
            <div
              key={rule.id}
              className={`p-4 rounded-lg border transition ${
                rule.enabled
                  ? "bg-white border-visa-gray-200"
                  : "bg-visa-gray-50 border-visa-gray-200 opacity-60"
              }`}
            >
              <div className="flex items-start gap-4">
                {/* Toggle */}
                <button
                  onClick={() => handleToggle(rule)}
                  className={`mt-1 flex-shrink-0 w-10 h-5 rounded-full transition ${
                    rule.enabled ? "bg-green-500" : "bg-visa-gray-300"
                  }`}
                >
                  <div
                    className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${
                      rule.enabled ? "translate-x-5" : "translate-x-0.5"
                    }`}
                  />
                </button>

                {/* ID badge */}
                <div className="flex-shrink-0 w-12 h-8 bg-visa-navy text-white rounded flex items-center justify-center text-xs font-bold">
                  {rule.id}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-visa-navy">{rule.name}</span>
                    {rule.is_custom && (
                      <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-medium">
                        Custom
                      </span>
                    )}
                    {rule.is_modified && !rule.is_custom && (
                      <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-medium">
                        Modified
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-visa-gray-600 mt-0.5">{rule.description}</p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {rule.columns.map((col) => (
                      <span key={col} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">
                        {col}
                      </span>
                    ))}
                  </div>

                  {/* SQL toggle + Test/Resolution buttons */}
                  <div className="flex items-center gap-3 mt-2">
                    <button
                      onClick={() => setExpandedSql(expandedSql === rule.id ? null : rule.id)}
                      className="text-xs text-visa-gray-400 hover:text-visa-navy flex items-center gap-1"
                    >
                      <svg
                        className={`w-3 h-3 transition-transform ${expandedSql === rule.id ? "rotate-90" : ""}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      {expandedSql === rule.id ? "Hide SQL" : "Show SQL"}
                    </button>
                    <button
                      onClick={() => handleTestRule(rule)}
                      disabled={testingRule === rule.id || !rule.sql}
                      className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 disabled:opacity-50 flex items-center gap-1"
                    >
                      {testingRule === rule.id ? (
                        <span className="inline-block w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      )}
                      Test Rule
                    </button>
                    <button
                      onClick={() => handleGenerateStrategy(rule)}
                      disabled={generatingStrategy === rule.id || !rule.sql}
                      className="text-xs px-2 py-0.5 bg-purple-50 text-purple-700 rounded hover:bg-purple-100 disabled:opacity-50 flex items-center gap-1"
                    >
                      {generatingStrategy === rule.id ? (
                        <span className="inline-block w-3 h-3 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                      )}
                      {generatingStrategy === rule.id ? "Generating..." : "Resolution Strategy"}
                    </button>
                  </div>

                  {expandedSql === rule.id && (
                    <>
                      <pre className="mt-2 p-3 bg-visa-gray-900 text-green-400 rounded-lg text-xs overflow-x-auto max-h-48 overflow-y-auto font-mono">
                        {rule.sql}
                      </pre>

                      {/* Test Results */}
                      {testResults[rule.id] && (
                        <div className={`mt-2 p-3 rounded-lg text-sm ${
                          testResults[rule.id].status === "error"
                            ? "bg-red-50 border border-red-200"
                            : testResults[rule.id].total_rows_flagged > 0
                            ? "bg-amber-50 border border-amber-200"
                            : "bg-green-50 border border-green-200"
                        }`}>
                          {testResults[rule.id].status === "error" ? (
                            <div>
                              <span className="font-semibold text-red-700">SQL Error: </span>
                              <span className="text-red-600 text-xs font-mono">{testResults[rule.id].error}</span>
                            </div>
                          ) : (
                            <div>
                              <div className="flex items-center gap-4 mb-2">
                                <span className="font-semibold text-visa-navy">
                                  {testResults[rule.id].total_rows_flagged.toLocaleString()} rows flagged
                                </span>
                                <span className="text-xs text-visa-gray-500">
                                  out of {testResults[rule.id].total_ammf_rows.toLocaleString()} AMMF rows
                                </span>
                                {testResults[rule.id].total_rows_flagged === 0 && (
                                  <span className="text-xs text-green-600 font-medium">No violations found</span>
                                )}
                              </div>
                              {testResults[rule.id].sample_rows.length > 0 && (
                                <div className="mt-2 overflow-x-auto">
                                  <table className="text-xs w-full border-collapse">
                                    <thead>
                                      <tr>
                                        {testResults[rule.id].columns.slice(0, 8).map((col) => (
                                          <th key={col} className="px-2 py-1 text-left bg-visa-gray-100 border border-visa-gray-200 font-medium text-visa-gray-600 whitespace-nowrap">
                                            {col}
                                          </th>
                                        ))}
                                        {testResults[rule.id].columns.length > 8 && (
                                          <th className="px-2 py-1 bg-visa-gray-100 border border-visa-gray-200 text-visa-gray-400">...</th>
                                        )}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {testResults[rule.id].sample_rows.slice(0, 5).map((row, i) => (
                                        <tr key={i}>
                                          {testResults[rule.id].columns.slice(0, 8).map((col) => (
                                            <td key={col} className="px-2 py-1 border border-visa-gray-200 max-w-32 truncate whitespace-nowrap">
                                              {String(row[col] ?? "")}
                                            </td>
                                          ))}
                                          {testResults[rule.id].columns.length > 8 && (
                                            <td className="px-2 py-1 border border-visa-gray-200 text-visa-gray-400">...</td>
                                          )}
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                  {testResults[rule.id].total_rows_flagged > 5 && (
                                    <p className="text-xs text-visa-gray-400 mt-1">
                                      Showing 5 of {testResults[rule.id].total_rows_flagged.toLocaleString()} flagged rows
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Actions */}
                <div className="flex-shrink-0 flex gap-2">
                  <button
                    onClick={() => setEditingRule(rule)}
                    className="p-1.5 text-visa-gray-400 hover:text-visa-navy hover:bg-visa-gray-100 rounded"
                    title="Edit"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  {(rule.is_custom || rule.is_modified) && (
                    <button
                      onClick={() => handleDelete(rule.id, rule.is_custom)}
                      className="p-1.5 text-visa-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                      title={rule.is_custom ? "Delete" : "Reset to default"}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* LLM Prompts */}
      <LLMPromptsSection prompts={prompts} onReload={loadRules} />

      {/* Edit Modal */}
      {editingRule && (
        <RuleEditorModal
          rule={editingRule}
          isNew={false}
          onSave={handleSaveEdit}
          onCancel={() => setEditingRule(null)}
        />
      )}

      {/* Create Modal */}
      {isCreating && (
        <RuleEditorModal
          rule={null}
          isNew={true}
          onSave={handleCreate}
          onCancel={() => setIsCreating(false)}
        />
      )}

      {/* Resolution Strategy Modal */}
      {resolutionStrategy && (
        <ResolutionStrategyModal
          strategy={resolutionStrategy}
          onClose={() => setResolutionStrategy(null)}
        />
      )}
    </div>
  );
}
