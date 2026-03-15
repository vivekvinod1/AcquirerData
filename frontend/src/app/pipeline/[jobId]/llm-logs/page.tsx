"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { getLLMLogs, updatePrompt } from "@/lib/api";
import type { LLMCallSummary, LLMCallLog } from "@/lib/types";

/* ─── Prompt Editor Modal ─── */
function PromptEditorModal({
  promptKey,
  currentValue,
  onSave,
  onCancel,
}: {
  promptKey: string;
  currentValue: string;
  onSave: (key: string, value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(currentValue);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave(promptKey, value);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-visa-gray-200">
          <h3 className="text-lg font-semibold text-visa-navy">
            Edit System Prompt
          </h3>
          <p className="text-sm text-visa-gray-500 mt-1">
            Changes will apply to future pipeline runs. This overrides the default prompt for the <code className="bg-visa-gray-100 px-1 rounded">{promptKey}</code> step.
          </p>
        </div>
        <div className="flex-1 p-6 overflow-auto">
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full h-80 border border-visa-gray-300 rounded-lg px-4 py-3 text-sm font-mono bg-visa-gray-50 leading-relaxed resize-y"
            spellCheck={false}
          />
        </div>
        <div className="p-6 border-t border-visa-gray-200 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-visa-gray-600 bg-visa-gray-100 rounded-lg hover:bg-visa-gray-200"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || value === currentValue}
            className="px-4 py-2 text-sm text-white bg-visa-navy rounded-lg hover:bg-visa-blue disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Prompt"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Label → prompt key mapping ─── */
function getPromptKeyFromLabel(label: string): string | null {
  const lower = label.toLowerCase();
  if (lower.includes("schema mapping")) return "schema_mapping";
  if (lower.includes("relationship")) return "relationship_discovery";
  if (lower.includes("sql generation")) return "sql_generation";
  if (lower.includes("chat")) return "chat";
  return null;
}

/* ─── Label color chip ─── */
function LabelChip({ label }: { label: string }) {
  const colors: Record<string, string> = {
    "Schema Mapping": "bg-blue-100 text-blue-700",
    "Relationship Discovery": "bg-purple-100 text-purple-700",
    "SQL Generation": "bg-green-100 text-green-700",
    "Chat Response": "bg-amber-100 text-amber-700",
    "Research: Query Gen": "bg-pink-100 text-pink-700",
    "Research: Analysis": "bg-pink-100 text-pink-700",
    "Research: Fix Suggestions": "bg-pink-100 text-pink-700",
  };

  const color = colors[label] || (label.includes("Retry") ? "bg-orange-100 text-orange-700" : "bg-gray-100 text-gray-700");

  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  );
}

export default function LLMLogsPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = use(params);
  const router = useRouter();
  const [summary, setSummary] = useState<LLMCallSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedCall, setExpandedCall] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<Record<number, string>>({});
  const [editingPrompt, setEditingPrompt] = useState<{
    key: string;
    value: string;
  } | null>(null);

  useEffect(() => {
    getLLMLogs(jobId)
      .then((data) => setSummary(data))
      .finally(() => setLoading(false));
  }, [jobId]);

  const getTabForCall = (callId: number) => activeTab[callId] || "system";

  const setTab = (callId: number, tab: string) => {
    setActiveTab((prev) => ({ ...prev, [callId]: tab }));
  };

  const handleEditPrompt = (call: LLMCallLog) => {
    const key = getPromptKeyFromLabel(call.label || call.method);
    if (key) {
      setEditingPrompt({ key, value: call.system_prompt });
    }
  };

  const handleSavePrompt = async (key: string, value: string) => {
    try {
      await updatePrompt(key, value);
      setEditingPrompt(null);
    } catch (err) {
      alert(`Failed to save prompt: ${err}`);
    }
  };

  if (loading) return <div className="text-center py-12 text-visa-gray-500">Loading LLM logs...</div>;
  if (!summary) return <div className="text-center py-12 text-visa-gray-500">No LLM data available</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-visa-navy">LLM Control Panel</h2>
          <p className="text-sm text-visa-gray-500">All Claude API calls, prompts, outputs, and costs</p>
        </div>
        <button onClick={() => router.push(`/pipeline/${jobId}`)}
          className="px-4 py-2 text-sm bg-visa-gray-100 text-visa-gray-700 rounded-lg hover:bg-visa-gray-200">
          Back to Dashboard
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-lg shadow-sm border border-visa-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-visa-navy">{summary.total_calls}</div>
          <div className="text-xs text-visa-gray-500 mt-1">Total Calls</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-visa-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-visa-navy">{summary.total_input_tokens.toLocaleString()}</div>
          <div className="text-xs text-visa-gray-500 mt-1">Input Tokens</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-visa-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-visa-navy">{summary.total_output_tokens.toLocaleString()}</div>
          <div className="text-xs text-visa-gray-500 mt-1">Output Tokens</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-visa-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-visa-gold">${summary.total_cost_usd.toFixed(4)}</div>
          <div className="text-xs text-visa-gray-500 mt-1">Total Cost</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-visa-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-visa-navy">{(summary.total_duration_ms / 1000).toFixed(1)}s</div>
          <div className="text-xs text-visa-gray-500 mt-1">Total Duration</div>
        </div>
      </div>

      {/* Call List */}
      <div className="space-y-3">
        {summary.calls.map((call) => (
          <div key={call.call_id} className="bg-white rounded-lg shadow-sm border border-visa-gray-200 overflow-hidden">
            {/* Call Header */}
            <button
              onClick={() => setExpandedCall(expandedCall === call.call_id ? null : call.call_id)}
              className="w-full p-4 flex items-center justify-between hover:bg-visa-gray-50 transition"
            >
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 bg-visa-navy text-white rounded-full flex items-center justify-center text-xs font-bold">
                  {call.call_id}
                </span>
                <div className="text-left">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-visa-navy">
                      {call.label || call.method}
                    </span>
                    <LabelChip label={call.label || call.method} />
                  </div>
                  <div className="text-xs text-visa-gray-500">{call.model}</div>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs text-visa-gray-500">
                <span>{call.input_tokens.toLocaleString()} in</span>
                <span>{call.output_tokens.toLocaleString()} out</span>
                <span className="text-visa-gold font-medium">${call.cost_usd.toFixed(4)}</span>
                <span>{(call.duration_ms / 1000).toFixed(1)}s</span>
                {call.error && <span className="text-visa-red font-medium">ERROR</span>}
                <span className="text-visa-gray-300">{expandedCall === call.call_id ? "▲" : "▼"}</span>
              </div>
            </button>

            {/* Expanded Detail */}
            {expandedCall === call.call_id && (
              <div className="border-t border-visa-gray-200">
                {/* Tab Bar */}
                <div className="flex border-b border-visa-gray-200">
                  {["system", "user", "output"].map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setTab(call.call_id, tab)}
                      className={`px-4 py-2 text-sm font-medium transition ${
                        getTabForCall(call.call_id) === tab
                          ? "border-b-2 border-visa-navy text-visa-navy"
                          : "text-visa-gray-500 hover:text-visa-gray-700"
                      }`}
                    >
                      {tab === "system" ? "System Prompt" : tab === "user" ? "User Prompt" : "Output"}
                    </button>
                  ))}
                  {/* Edit button for system prompt */}
                  {getTabForCall(call.call_id) === "system" && getPromptKeyFromLabel(call.label || call.method) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditPrompt(call);
                      }}
                      className="ml-auto mr-2 px-3 py-1 text-xs text-visa-navy bg-visa-gray-100 rounded hover:bg-visa-gray-200 flex items-center gap-1 my-1"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Edit Prompt
                    </button>
                  )}
                </div>
                {/* Tab Content */}
                <div className="p-4 bg-visa-gray-50 max-h-96 overflow-auto">
                  <pre className="text-xs font-mono text-visa-gray-700 whitespace-pre-wrap leading-relaxed">
                    {getTabForCall(call.call_id) === "system" && (call.system_prompt || "(empty)")}
                    {getTabForCall(call.call_id) === "user" && (call.user_prompt || "(empty)")}
                    {getTabForCall(call.call_id) === "output" && (call.error ? `ERROR: ${call.error}` : call.output || "(empty)")}
                  </pre>
                </div>
              </div>
            )}
          </div>
        ))}

        {summary.calls.length === 0 && (
          <div className="text-center py-8 text-visa-gray-500">No LLM calls recorded yet. Run the pipeline first.</div>
        )}
      </div>

      {/* Prompt Editor Modal */}
      {editingPrompt && (
        <PromptEditorModal
          promptKey={editingPrompt.key}
          currentValue={editingPrompt.value}
          onSave={handleSavePrompt}
          onCancel={() => setEditingPrompt(null)}
        />
      )}
    </div>
  );
}
