"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import ViolationTable from "@/components/ViolationTable";
import { getViolations } from "@/lib/api";
import type { ViolationReport } from "@/lib/types";

export default function ViolationsPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = use(params);
  const router = useRouter();
  const [report, setReport] = useState<ViolationReport | null>(null);
  const [loading, setLoading] = useState(true);

  const loadReport = useCallback(() => {
    getViolations(jobId)
      .then((data) => setReport(data))
      .finally(() => setLoading(false));
  }, [jobId]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  if (loading) return <div className="text-center py-12 text-visa-gray-500">Loading violation report...</div>;
  if (!report) return <div className="text-center py-12 text-visa-gray-500">Violation report not yet available</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-visa-navy">Violation Report</h2>
          <p className="text-sm text-visa-gray-500">
            {report.total_violations} violations found across {report.violations.filter(v => v.count > 0).length} rule categories
          </p>
        </div>
        <button
          onClick={() => router.push(`/pipeline/${jobId}`)}
          className="px-4 py-2 text-sm bg-visa-gray-100 text-visa-gray-700 rounded-lg hover:bg-visa-gray-200"
        >
          Back to Dashboard
        </button>
      </div>
      {/* Summary stats */}
      {report.total_ammf_rows > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-visa-gray-200 p-4 text-center shadow-sm">
            <p className="text-2xl font-bold text-visa-navy">{report.total_ammf_rows.toLocaleString()}</p>
            <p className="text-xs text-visa-gray-500 mt-1">Total AMMF Records</p>
          </div>
          <div className="bg-white rounded-xl border border-green-200 p-4 text-center shadow-sm">
            <p className="text-2xl font-bold text-green-600">{report.clean_rows.toLocaleString()}</p>
            <p className="text-xs text-visa-gray-500 mt-1">Clean Records</p>
            {report.total_ammf_rows > 0 && (
              <div className="mt-2 w-full bg-visa-gray-100 rounded-full h-1.5">
                <div
                  className="bg-green-500 h-1.5 rounded-full"
                  style={{ width: `${(report.clean_rows / report.total_ammf_rows) * 100}%` }}
                />
              </div>
            )}
          </div>
          <div className="bg-white rounded-xl border border-red-200 p-4 text-center shadow-sm">
            <p className="text-2xl font-bold text-visa-red">{report.violated_rows.toLocaleString()}</p>
            <p className="text-xs text-visa-gray-500 mt-1">Records with Violations</p>
            {report.total_ammf_rows > 0 && (
              <div className="mt-2 w-full bg-visa-gray-100 rounded-full h-1.5">
                <div
                  className="bg-red-500 h-1.5 rounded-full"
                  style={{ width: `${(report.violated_rows / report.total_ammf_rows) * 100}%` }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tip banner for web research */}
      {report.total_violations > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
          <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-sm text-blue-800 font-medium">Investigate & Research Merchants</p>
            <p className="text-xs text-blue-700 mt-1">
              Click <strong>&quot;Investigate&quot;</strong> on any violation to see all affected rows.
              Then use the <strong>&quot;Research&quot;</strong> button on individual merchants to launch an
              AI-powered web search that finds correct business details and suggests fixes.
            </p>
          </div>
        </div>
      )}
      <ViolationTable report={report} jobId={jobId} onViolationsUpdated={loadReport} />
    </div>
  );
}
