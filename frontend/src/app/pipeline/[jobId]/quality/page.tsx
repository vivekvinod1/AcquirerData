"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import DQReport from "@/components/DQReport";
import { getQualityReport } from "@/lib/api";
import type { QualityReport } from "@/lib/types";

export default function QualityPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = use(params);
  const router = useRouter();
  const [report, setReport] = useState<QualityReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getQualityReport(jobId)
      .then((data) => setReport(data))
      .finally(() => setLoading(false));
  }, [jobId]);

  if (loading) return <div className="text-center py-12 text-visa-gray-500">Loading quality report...</div>;
  if (!report) return <div className="text-center py-12 text-visa-gray-500">Quality report not yet available</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-visa-navy">Data Quality Report</h2>
          <p className="text-sm text-visa-gray-500">{report.tables.length} tables analyzed</p>
        </div>
        <button
          onClick={() => router.push(`/pipeline/${jobId}`)}
          className="px-4 py-2 text-sm bg-visa-gray-100 text-visa-gray-700 rounded-lg hover:bg-visa-gray-200"
        >
          Back to Dashboard
        </button>
      </div>
      <DQReport report={report} />
    </div>
  );
}
