"use client";
import { useState, useEffect } from "react";
import { getAMMFPreview, getAMMFDownloadUrl, getReportsDownloadUrl } from "@/lib/api";
import type { AMMFPreview as AMMFPreviewType } from "@/lib/types";

interface AMMFPreviewProps {
  jobId: string;
}

export default function AMMFPreview({ jobId }: AMMFPreviewProps) {
  const [data, setData] = useState<AMMFPreviewType | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getAMMFPreview(jobId, page).then((d) => setData(d)).finally(() => setLoading(false));
  }, [jobId, page]);

  if (loading) return <div className="text-center py-8 text-visa-gray-500">Loading preview...</div>;
  if (!data || data.rows.length === 0) return <div className="text-center py-8 text-visa-gray-500">No data available</div>;

  const columns = Object.keys(data.rows[0]);
  const totalPages = Math.ceil(data.total / data.page_size);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-visa-gray-500">
          Showing {(page - 1) * data.page_size + 1}-{Math.min(page * data.page_size, data.total)} of {data.total.toLocaleString()} rows
        </p>
        <div className="flex gap-2">
          <a
            href={getAMMFDownloadUrl(jobId)}
            className="px-4 py-2 bg-visa-navy text-white rounded-lg text-sm font-medium hover:bg-visa-blue"
          >
            Download AMMF
          </a>
          <a
            href={getReportsDownloadUrl(jobId)}
            className="px-4 py-2 bg-visa-gold text-visa-navy rounded-lg text-sm font-medium hover:opacity-90"
          >
            Download Full Report
          </a>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-visa-gray-200 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-visa-navy text-white">
            <tr>
              {columns.map((col) => (
                <th key={col} className="p-2 text-left font-medium whitespace-nowrap">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-visa-gray-100">
            {data.rows.map((row, i) => (
              <tr key={i} className="hover:bg-visa-gray-50">
                {columns.map((col) => (
                  <td key={col} className="p-2 whitespace-nowrap max-w-[200px] truncate">
                    {String(row[col] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-center gap-2">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
          className="px-3 py-1 rounded border border-visa-gray-300 text-sm disabled:opacity-50"
        >
          Previous
        </button>
        <span className="text-sm text-visa-gray-500">Page {page} of {totalPages}</span>
        <button
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages}
          className="px-3 py-1 rounded border border-visa-gray-300 text-sm disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}
