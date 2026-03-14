"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { getLLMLogs } from "@/lib/api";
import type { LLMCallSummary, LLMCallLog } from "@/lib/types";

export default function LLMLogsPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = use(params);
  const router = useRouter();
  const [summary, setSummary] = useState<LLMCallSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedCall, setExpandedCall] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<Record<number, string>>({});

  useEffect(() => {
    getLLMLogs(jobId)
      .then((data) => setSummary(data))
      .finally(() => setLoading(false));
  }, [jobId]);

  const getTabForCall = (callId: number) => activeTab[callId] || "system";

  const setTab = (callId: number, tab: string) => {
    setActiveTab((prev) => ({ ...prev, [callId]: tab }));
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
                  <div className="text-sm font-medium text-visa-navy">{call.method}</div>
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
    </div>
  );
}
