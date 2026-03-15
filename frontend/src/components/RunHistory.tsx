"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { listJobs } from "@/lib/api";
import type { JobSummary } from "@/lib/types";

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  uploaded: { label: "Uploaded", color: "bg-gray-100 text-gray-700" },
  ingestion: { label: "Ingesting", color: "bg-blue-100 text-blue-700" },
  awaiting_approval: { label: "Awaiting Review", color: "bg-amber-100 text-amber-700" },
  schema_mapping: { label: "Mapping", color: "bg-blue-100 text-blue-700" },
  completeness: { label: "Completeness", color: "bg-blue-100 text-blue-700" },
  relationships: { label: "Relationships", color: "bg-blue-100 text-blue-700" },
  quality: { label: "Quality Check", color: "bg-blue-100 text-blue-700" },
  query_generation: { label: "Generating SQL", color: "bg-blue-100 text-blue-700" },
  executing: { label: "Executing", color: "bg-blue-100 text-blue-700" },
  validation: { label: "Validating", color: "bg-blue-100 text-blue-700" },
  complete: { label: "Complete", color: "bg-green-100 text-green-700" },
  error: { label: "Error", color: "bg-red-100 text-red-700" },
};

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function RunHistory() {
  const router = useRouter();
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listJobs()
      .then(setJobs)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="mt-10">
        <h3 className="text-lg font-semibold text-visa-navy mb-4">Previous Runs</h3>
        <div className="text-center py-6 text-visa-gray-400 text-sm">Loading...</div>
      </div>
    );
  }

  if (jobs.length === 0) return null;

  return (
    <div className="mt-10">
      <h3 className="text-lg font-semibold text-visa-navy mb-4">Previous Runs</h3>
      <div className="bg-white rounded-lg shadow-sm border border-visa-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-visa-gray-50 border-b border-visa-gray-200">
            <tr>
              <th className="text-left p-3 font-medium text-visa-gray-600">Job ID</th>
              <th className="text-left p-3 font-medium text-visa-gray-600">Files</th>
              <th className="text-left p-3 font-medium text-visa-gray-600">Rows</th>
              <th className="text-left p-3 font-medium text-visa-gray-600">Status</th>
              <th className="text-left p-3 font-medium text-visa-gray-600">Violations</th>
              <th className="text-left p-3 font-medium text-visa-gray-600">Started</th>
              <th className="text-center p-3 font-medium text-visa-gray-600">Progress</th>
              <th className="text-center p-3 font-medium text-visa-gray-600"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-visa-gray-100">
            {jobs.map((job) => {
              const cfg = STATUS_CONFIG[job.step] || {
                label: job.step,
                color: "bg-gray-100 text-gray-700",
              };
              const isActive =
                job.step !== "complete" &&
                job.step !== "error" &&
                job.step !== "uploaded";

              return (
                <tr
                  key={job.job_id}
                  className="hover:bg-visa-gray-50 cursor-pointer transition"
                  onClick={() => router.push(`/pipeline/${job.job_id}`)}
                >
                  <td className="p-3 font-mono text-visa-navy font-medium">
                    {job.job_id}
                  </td>
                  <td className="p-3 text-visa-gray-700 max-w-[200px] truncate">
                    {job.file_names.length > 0
                      ? job.file_names.join(", ")
                      : "—"}
                  </td>
                  <td className="p-3 text-visa-gray-700">
                    {job.total_rows > 0
                      ? job.total_rows.toLocaleString()
                      : "—"}
                  </td>
                  <td className="p-3">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.color}`}
                    >
                      {isActive && (
                        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                      )}
                      {cfg.label}
                    </span>
                  </td>
                  <td className="p-3 text-visa-gray-700">
                    {job.violation_count !== null ? (
                      <span
                        className={
                          job.violation_count > 0
                            ? "text-red-600 font-medium"
                            : "text-green-600 font-medium"
                        }
                      >
                        {job.violation_count.toLocaleString()}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="p-3 text-visa-gray-500 text-xs">
                    {formatTime(job.started_at || job.created_at)}
                  </td>
                  <td className="p-3">
                    <div className="w-20 mx-auto">
                      <div className="w-full bg-visa-gray-200 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full transition-all ${
                            job.step === "complete"
                              ? "bg-green-500"
                              : job.step === "error"
                              ? "bg-red-500"
                              : "bg-visa-gold"
                          }`}
                          style={{ width: `${job.progress_pct}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-visa-gray-400 text-center mt-0.5">
                        {job.progress_pct}%
                      </p>
                    </div>
                  </td>
                  <td className="p-3 text-center">
                    <svg
                      className="w-4 h-4 text-visa-gray-400 mx-auto"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
