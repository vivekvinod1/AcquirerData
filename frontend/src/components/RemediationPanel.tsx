"use client";

import { useState } from "react";
import type { RemediationPlan, RemediationFix, RemediationApplyResult, ViolationRecord } from "@/lib/types";
import { getRemediationPlan, applyRemediationFixes } from "@/lib/api";
import WebResearchModal from "./WebResearchModal";

interface Props {
  jobId: string;
  violation: ViolationRecord;
  onFixApplied?: (result: RemediationApplyResult) => void;
}

const STRATEGY_BADGE: Record<string, { label: string; color: string }> = {
  auto_fix: { label: "Auto Fix", color: "bg-green-100 text-green-800" },
  web_research: { label: "Web Research", color: "bg-blue-100 text-blue-800" },
  manual_review: { label: "Manual Review", color: "bg-amber-100 text-amber-800" },
};

export default function RemediationPanel({ jobId, violation, onFixApplied }: Props) {
  const [plan, setPlan] = useState<RemediationPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [selectedFixes, setSelectedFixes] = useState<Set<number>>(new Set());
  const [result, setResult] = useState<RemediationApplyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [researchTarget, setResearchTarget] = useState<{
    merchantName: string;
    context: string;
    columns: string[];
    rowIndex: number;
  } | null>(null);

  const handleGeneratePlan = async () => {
    setLoading(true);
    setError(null);
    try {
      const p = await getRemediationPlan(jobId, violation.rule_id);
      setPlan(p);
      // Auto-select all auto-fixable items
      const autoIndices = new Set<number>();
      p.fixes.forEach((f, i) => {
        if (f.strategy === "auto_fix" && f.new_value !== null && !f.needs_confirmation) {
          autoIndices.add(i);
        }
      });
      setSelectedFixes(autoIndices);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to generate plan");
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!plan || selectedFixes.size === 0) return;
    setApplying(true);
    setError(null);
    try {
      const r = await applyRemediationFixes(jobId, violation.rule_id, Array.from(selectedFixes));
      setResult(r);
      onFixApplied?.(r);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to apply fixes");
    } finally {
      setApplying(false);
    }
  };

  const toggleFix = (idx: number) => {
    const next = new Set(selectedFixes);
    next.has(idx) ? next.delete(idx) : next.add(idx);
    setSelectedFixes(next);
  };

  const selectAllAutoFix = () => {
    if (!plan) return;
    const next = new Set<number>();
    plan.fixes.forEach((f, i) => {
      if (f.new_value !== null) next.add(i);
    });
    setSelectedFixes(next);
  };

  if (!plan) {
    return (
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={handleGeneratePlan}
          disabled={loading}
          className="px-4 py-2 bg-visa-navy text-white rounded-lg text-sm font-medium hover:bg-visa-navy/90 disabled:opacity-50 transition"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
              Analyzing...
            </span>
          ) : (
            "Fix Violations"
          )}
        </button>
        {error && <span className="text-red-500 text-sm">{error}</span>}
      </div>
    );
  }

  if (result) {
    return (
      <div className="mt-3 p-4 rounded-lg bg-green-50 border border-green-200">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-green-600 font-bold text-lg">Fixes Applied</span>
        </div>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Rows modified</span>
            <p className="font-bold text-green-700">{result.rows_modified}</p>
          </div>
          <div>
            <span className="text-gray-500">Before</span>
            <p className="font-bold text-red-600">{result.previous_violation_count}</p>
          </div>
          <div>
            <span className="text-gray-500">After</span>
            <p className="font-bold text-green-600">{result.new_violation_count}</p>
          </div>
        </div>
        {result.delta > 0 && (
          <p className="mt-2 text-sm text-green-700 font-medium">
            {result.delta} violations resolved ({Math.round((result.delta / result.previous_violation_count) * 100)}% reduction)
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 border border-visa-gray-200 rounded-lg bg-white overflow-hidden">
      {/* Header */}
      <div className="p-4 bg-visa-gray-50 border-b flex items-center justify-between">
        <div>
          <h4 className="font-semibold text-visa-navy">Remediation Plan</h4>
          <p className="text-sm text-visa-gray-500">{plan.summary}</p>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-medium ${STRATEGY_BADGE[plan.strategy]?.color || "bg-gray-100"}`}>
          {STRATEGY_BADGE[plan.strategy]?.label || plan.strategy}
        </span>
      </div>

      {/* Fixes list */}
      <div className="max-h-80 overflow-y-auto divide-y divide-visa-gray-100">
        {plan.fixes.slice(0, 100).map((fix, i) => (
          <FixRow
            key={i}
            fix={fix}
            index={i}
            selected={selectedFixes.has(i)}
            onToggle={() => toggleFix(i)}
            onResearch={() =>
              setResearchTarget({
                merchantName: fix.old_value || "Unknown Merchant",
                context: `${violation.rule_id}: ${violation.description}. Column: ${fix.column}, Current value: ${fix.old_value || "empty"}`,
                columns: violation.affected_columns,
                rowIndex: fix.row_indices[0] ?? 0,
              })
            }
          />
        ))}
        {plan.fixes.length > 100 && (
          <div className="p-3 text-center text-sm text-visa-gray-500">
            Showing 100 of {plan.fixes.length} fixes
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="p-4 bg-visa-gray-50 border-t flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={selectAllAutoFix} className="text-sm text-visa-navy hover:underline">
            Select all fixable
          </button>
          <span className="text-sm text-visa-gray-500">
            {selectedFixes.size} of {plan.fixes.length} selected
          </span>
        </div>
        <div className="flex items-center gap-3">
          {error && <span className="text-red-500 text-sm">{error}</span>}
          <button
            onClick={handleApply}
            disabled={applying || selectedFixes.size === 0}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition"
          >
            {applying ? "Applying..." : `Apply ${selectedFixes.size} Fixes`}
          </button>
        </div>
      </div>

      {/* Web Research Modal */}
      {researchTarget && (
        <WebResearchModal
          jobId={jobId}
          merchantName={researchTarget.merchantName}
          violationContext={researchTarget.context}
          affectedColumns={researchTarget.columns}
          rowIndex={researchTarget.rowIndex}
          onClose={() => setResearchTarget(null)}
          onFixApplied={() => {
            setResearchTarget(null);
            handleGeneratePlan(); // Refresh plan after web fix
          }}
        />
      )}
    </div>
  );
}

function FixRow({
  fix,
  index,
  selected,
  onToggle,
  onResearch,
}: {
  fix: RemediationFix;
  index: number;
  selected: boolean;
  onToggle: () => void;
  onResearch: () => void;
}) {
  const badge = STRATEGY_BADGE[fix.strategy] || STRATEGY_BADGE.manual_review;
  const canApply = fix.new_value !== null;

  return (
    <div className={`p-3 flex items-start gap-3 text-sm ${selected ? "bg-green-50/50" : ""}`}>
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        disabled={!canApply}
        className="mt-1 rounded border-gray-300"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-visa-navy">{fix.column}</span>
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${badge.color}`}>{badge.label}</span>
          {fix.confidence > 0 && (
            <span className="text-xs text-visa-gray-400">{Math.round(fix.confidence * 100)}% confidence</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs">
          {fix.old_value && (
            <span className="bg-red-50 text-red-700 px-2 py-0.5 rounded line-through max-w-48 truncate">
              {fix.old_value}
            </span>
          )}
          {fix.new_value ? (
            <>
              <span className="text-visa-gray-400">&rarr;</span>
              <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded max-w-48 truncate">
                {fix.new_value}
              </span>
            </>
          ) : (
            <span className="text-amber-600 italic">Needs value — use web research</span>
          )}
        </div>
        <p className="text-visa-gray-500 mt-1 text-xs">{fix.reasoning}</p>
      </div>
      {fix.strategy === "web_research" && (
        <button
          onClick={onResearch}
          className="shrink-0 px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 transition"
        >
          Research
        </button>
      )}
    </div>
  );
}
