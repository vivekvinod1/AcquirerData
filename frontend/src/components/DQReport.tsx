"use client";
import type { QualityReport, TableQuality } from "@/lib/types";

interface DQReportProps {
  report: QualityReport;
}

export default function DQReport({ report }: DQReportProps) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600 bg-green-50";
    if (score >= 60) return "text-yellow-600 bg-yellow-50";
    return "text-red-600 bg-red-50";
  };

  return (
    <div className="space-y-4">
      {report.tables.map((table) => (
        <div key={table.table_name} className="bg-white rounded-lg shadow-sm border border-visa-gray-200">
          <div className="p-4 border-b border-visa-gray-200 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-visa-navy">{table.table_name}</h3>
              <p className="text-sm text-visa-gray-500">{table.row_count.toLocaleString()} rows, {table.columns.length} columns</p>
            </div>
            <div className={`px-3 py-1 rounded-full font-bold text-lg ${getScoreColor(table.overall_score)}`}>
              {table.overall_score.toFixed(0)}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-visa-gray-50">
                <tr>
                  <th className="text-left p-2 font-medium">Column</th>
                  <th className="text-left p-2 font-medium">Type</th>
                  <th className="text-right p-2 font-medium">Null %</th>
                  <th className="text-right p-2 font-medium">Distinct</th>
                  <th className="text-left p-2 font-medium">Issues</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-visa-gray-100">
                {table.columns.map((col) => (
                  <tr key={col.column} className={col.issues.length > 0 ? "bg-red-50" : ""}>
                    <td className="p-2 font-medium">{col.column}</td>
                    <td className="p-2 text-visa-gray-500">{col.data_type}</td>
                    <td className={`p-2 text-right ${col.null_pct > 50 ? "text-visa-red font-bold" : ""}`}>
                      {col.null_pct.toFixed(1)}%
                    </td>
                    <td className="p-2 text-right">{col.distinct_count.toLocaleString()}</td>
                    <td className="p-2">
                      {col.issues.map((issue, i) => (
                        <span key={i} className="inline-block px-2 py-0.5 mr-1 mb-1 bg-visa-orange text-white text-xs rounded">
                          {issue}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
