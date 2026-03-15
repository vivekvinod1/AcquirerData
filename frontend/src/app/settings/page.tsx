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
  type DQRule,
  type ConfigViolationRule,
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

/* ─── Main Settings Page ─── */
export default function SettingsPage() {
  const router = useRouter();
  const [dqRules, setDqRules] = useState<DQRule[]>([]);
  const [violationRules, setViolationRules] = useState<ConfigViolationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRule, setEditingRule] = useState<ConfigViolationRule | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [expandedSql, setExpandedSql] = useState<string | null>(null);

  const loadRules = async () => {
    try {
      const [dq, vr] = await Promise.all([getDQRules(), getConfigViolationRules()]);
      setDqRules(dq);
      setViolationRules(vr);
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

  if (loading) {
    return <div className="text-center py-12 text-visa-gray-500">Loading configuration...</div>;
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-visa-navy">Settings</h2>
          <p className="text-sm text-visa-gray-500">
            Configure data quality checks and violation rules
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

                  {/* SQL toggle */}
                  <button
                    onClick={() => setExpandedSql(expandedSql === rule.id ? null : rule.id)}
                    className="mt-2 text-xs text-visa-gray-400 hover:text-visa-navy flex items-center gap-1"
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
                  {expandedSql === rule.id && (
                    <pre className="mt-2 p-3 bg-visa-gray-900 text-green-400 rounded-lg text-xs overflow-x-auto max-h-48 overflow-y-auto font-mono">
                      {rule.sql}
                    </pre>
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
    </div>
  );
}
