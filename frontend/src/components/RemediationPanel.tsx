"use client";

import { useState, useEffect, useCallback } from "react";
import type { ViolationRecord, ViolationRows } from "@/lib/types";
import { getViolationRows } from "@/lib/api";
import WebResearchModal from "./WebResearchModal";

interface Props {
  jobId: string;
  violation: ViolationRecord;
  onFixApplied?: () => void;
}

export default function RemediationPanel({ jobId, violation, onFixApplied }: Props) {
  const [data, setData] = useState<ViolationRows | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  // Web research state
  const [researchTarget, setResearchTarget] = useState<{
    merchantName: string;
    context: string;
    columns: string[];
    rowIndex: number;
  } | null>(null);

  const loadRows = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      const result = await getViolationRows(jobId, violation.rule_id, p, PAGE_SIZE);
      setData(result);
      setPage(p);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load violation rows");
    } finally {
      setLoading(false);
    }
  }, [jobId, violation.rule_id]);

  useEffect(() => {
    loadRows(1);
  }, [loadRows]);

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  // Pick a subset of columns to show — affected columns first, then a few others
  const displayColumns = data
    ? prioritizeColumns(data.columns, violation.affected_columns)
    : [];

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-visa-gray-600">
          <span className="font-semibold text-visa-navy">{data?.total ?? "..."}</span> violation rows
          {violation.group_count > 0 && violation.group_count !== violation.count && (
            <span className="ml-2 text-visa-gray-400">
              ({violation.group_count} groups)
            </span>
          )}
        </div>
        {data && data.total > 0 && (
          <div className="flex items-center gap-2 text-xs text-visa-gray-500">
            <button
              onClick={() => loadRows(page - 1)}
              disabled={page <= 1 || loading}
              className="px-2 py-1 rounded border border-visa-gray-200 hover:bg-visa-gray-100 disabled:opacity-30 transition"
            >
              Prev
            </button>
            <span>
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => loadRows(page + 1)}
              disabled={page >= totalPages || loading}
              className="px-2 py-1 rounded border border-visa-gray-200 hover:bg-visa-gray-100 disabled:opacity-30 transition"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && !data && (
        <div className="text-center py-6">
          <svg className="animate-spin h-6 w-6 mx-auto text-visa-navy mb-2" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          <p className="text-visa-gray-400 text-sm">Loading violation records...</p>
        </div>
      )}

      {/* Table */}
      {data && data.rows.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-lg border border-visa-gray-200">
            <table className="w-full text-xs">
              <thead className="bg-visa-gray-100 border-b border-visa-gray-200">
                <tr>
                  <th className="p-2 text-center font-medium text-visa-gray-500 whitespace-nowrap">
                    #
                  </th>
                  <th className="p-2 text-center font-medium text-visa-gray-500 whitespace-nowrap">
                    Action
                  </th>
                  {displayColumns.map((col) => (
                    <th
                      key={col}
                      className={`p-2 text-left font-medium whitespace-nowrap ${
                        violation.affected_columns.includes(col)
                          ? "text-visa-red font-bold"
                          : "text-visa-gray-500"
                      }`}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-visa-gray-100">
                {data.rows.map((row, idx) => {
                  const globalIdx = (page - 1) * PAGE_SIZE + idx;
                  const merchantName =
                    String(row["DBAName"] || row["LegalName"] || row["MerchantName"] || "Unknown");
                  return (
                    <tr key={idx} className="hover:bg-blue-50/30">
                      <td className="p-2 text-visa-gray-400 text-center">
                        {globalIdx + 1}
                      </td>
                      <td className="p-2 text-center">
                        <button
                          title="Research this merchant"
                          onClick={() =>
                            setResearchTarget({
                              merchantName,
                              context: `${violation.rule_id}: ${violation.description}. Affected columns: ${violation.affected_columns.join(", ")}`,
                              columns: violation.affected_columns,
                              rowIndex: globalIdx,
                            })
                          }
                          className="inline-flex items-center gap-1 px-2 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 transition whitespace-nowrap"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                          Research
                        </button>
                      </td>
                      {displayColumns.map((col) => {
                        const val = row[col];
                        const isAffected = violation.affected_columns.includes(col);
                        const display = val === "" || val === null || val === undefined
                          ? ""
                          : String(val);
                        const isEmpty = display === "";
                        return (
                          <td
                            key={col}
                            className={`p-2 max-w-48 truncate ${
                              isAffected
                                ? isEmpty
                                  ? "bg-red-50 text-red-400 italic"
                                  : "bg-amber-50/50 font-medium text-visa-navy"
                                : "text-visa-gray-600"
                            }`}
                            title={display}
                          >
                            {isEmpty && isAffected ? "(empty)" : display}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {displayColumns.length > 6 && (
            <p className="text-center text-xs text-visa-gray-400 mt-1">
              ← Scroll horizontally to see more columns →
            </p>
          )}
        </>
      )}

      {data && data.rows.length === 0 && !loading && (
        <div className="text-center py-6 bg-green-50 rounded-lg">
          <p className="text-green-600 font-semibold">No violation rows found</p>
        </div>
      )}

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
            loadRows(page); // Refresh current page
            onFixApplied?.();
          }}
        />
      )}
    </div>
  );
}

/**
 * Prioritize columns: affected columns first, then key identifiers, then rest.
 * Limit to ~12 columns so the table is readable.
 */
function prioritizeColumns(allColumns: string[], affected: string[]): string[] {
  const KEY_COLS = [
    "CAID", "AcquirerMerchantID", "DBAName", "LegalName",
    "Street", "City", "StateProvinceCode", "PostalCode", "CountryCode",
    "MCCCode", "CardAcceptorIDCode",
  ];

  const ordered: string[] = [];
  const seen = new Set<string>();

  // 1. Affected columns
  for (const col of affected) {
    if (allColumns.includes(col) && !seen.has(col)) {
      ordered.push(col);
      seen.add(col);
    }
  }

  // 2. Key identifier columns
  for (const col of KEY_COLS) {
    if (allColumns.includes(col) && !seen.has(col)) {
      ordered.push(col);
      seen.add(col);
    }
  }

  // 3. Remaining columns (up to limit)
  const MAX = 10;
  for (const col of allColumns) {
    if (ordered.length >= MAX) break;
    if (!seen.has(col)) {
      ordered.push(col);
      seen.add(col);
    }
  }

  return ordered;
}
