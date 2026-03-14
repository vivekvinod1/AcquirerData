"use client";
import { useState } from "react";
import type { ViolationReport } from "@/lib/types";
import RemediationPanel from "./RemediationPanel";

interface ViolationTableProps {
  report: ViolationReport;
  jobId: string;
  onViolationsUpdated?: () => void;
}

export default function ViolationTable({ report, jobId, onViolationsUpdated }: ViolationTableProps) {
  const [filter, setFilter] = useState<string | null>(null);
  const [expandedRule, setExpandedRule] = useState<string | null>(null);

  const filtered = filter
    ? report.violations.filter((v) => v.rule_id === filter)
    : report.violations.filter((v) => v.count > 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilter(null)}
          className={`px-3 py-1 rounded-full text-sm font-medium transition ${
            !filter ? "bg-visa-navy text-white" : "bg-visa-gray-100 text-visa-gray-700 hover:bg-visa-gray-200"
          }`}
        >
          All ({report.total_violations})
        </button>
        {report.violations.filter((v) => v.count > 0).map((v) => (
          <button
            key={v.rule_id}
            onClick={() => setFilter(v.rule_id)}
            className={`px-3 py-1 rounded-full text-sm font-medium transition ${
              filter === v.rule_id ? "bg-visa-navy text-white" : "bg-visa-gray-100 text-visa-gray-700 hover:bg-visa-gray-200"
            }`}
          >
            {v.rule_id} ({v.count})
          </button>
        ))}
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-visa-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-visa-gray-50 border-b">
            <tr>
              <th className="text-left p-3 font-medium">Rule</th>
              <th className="text-left p-3 font-medium">Description</th>
              <th className="text-left p-3 font-medium">Affected Columns</th>
              <th className="text-right p-3 font-medium">Groups</th>
              <th className="text-right p-3 font-medium">Rows</th>
              <th className="text-center p-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-visa-gray-100">
            {filtered.map((v) => (
              <ViolationRow
                key={v.rule_id}
                violation={v}
                jobId={jobId}
                isExpanded={expandedRule === v.rule_id}
                onToggle={() => setExpandedRule(expandedRule === v.rule_id ? null : v.rule_id)}
                onViolationsUpdated={onViolationsUpdated}
              />
            ))}
          </tbody>
        </table>
      </div>

      {report.total_violations === 0 && (
        <div className="text-center py-8 bg-green-50 rounded-lg">
          <p className="text-green-600 font-semibold text-lg">No Violations Found</p>
          <p className="text-green-500 text-sm">All 13 checks passed</p>
        </div>
      )}
    </div>
  );
}

function ViolationRow({
  violation,
  jobId,
  isExpanded,
  onToggle,
  onViolationsUpdated,
}: {
  violation: ViolationReport["violations"][0];
  jobId: string;
  isExpanded: boolean;
  onToggle: () => void;
  onViolationsUpdated?: () => void;
}) {
  return (
    <>
      <tr className="hover:bg-visa-gray-50">
        <td className="p-3">
          <span className="px-2 py-1 bg-visa-red text-white rounded text-xs font-bold">{violation.rule_id}</span>
        </td>
        <td className="p-3 text-visa-gray-700">{violation.description}</td>
        <td className="p-3">
          {violation.affected_columns.map((col) => (
            <span key={col} className="inline-block px-2 py-0.5 mr-1 bg-visa-gray-100 rounded text-xs">{col}</span>
          ))}
        </td>
        <td className="p-3 text-right font-bold text-visa-red">{(violation.group_count || violation.count).toLocaleString()}</td>
        <td className="p-3 text-right text-visa-gray-500">{violation.count.toLocaleString()}</td>
        <td className="p-3 text-center">
          <button
            onClick={onToggle}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              isExpanded
                ? "bg-visa-navy text-white"
                : "bg-visa-gold text-visa-navy hover:bg-visa-gold/80"
            }`}
          >
            {isExpanded ? "Close" : "Investigate"}
          </button>
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={6} className="p-4 bg-visa-gray-50/50">
            <RemediationPanel
              jobId={jobId}
              violation={violation}
              onFixApplied={onViolationsUpdated}
            />
          </td>
        </tr>
      )}
    </>
  );
}
