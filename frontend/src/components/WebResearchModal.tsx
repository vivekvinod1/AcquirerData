"use client";

import { useState, useEffect } from "react";
import type { WebResearchResult } from "@/lib/types";
import { webResearch, applyWebFix } from "@/lib/api";

interface Props {
  jobId: string;
  merchantName: string;
  violationContext: string;
  affectedColumns: string[];
  rowIndex: number;
  onClose: () => void;
  onFixApplied: () => void;
}

export default function WebResearchModal({
  jobId,
  merchantName,
  violationContext,
  affectedColumns,
  rowIndex,
  onClose,
  onFixApplied,
}: Props) {
  const [objective, setObjective] = useState("");
  const [result, setResult] = useState<WebResearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [selectedFixes, setSelectedFixes] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  const handleResearch = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await webResearch(jobId, merchantName, violationContext, objective, affectedColumns);
      setResult(r);
      // Auto-select high-confidence fixes
      const auto = new Set<number>();
      r.suggested_fixes.forEach((f, i) => {
        if ((f.confidence ?? 0) >= 0.7) auto.add(i);
      });
      setSelectedFixes(auto);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Research failed");
    } finally {
      setLoading(false);
    }
  };

  const handleApplyFixes = async () => {
    if (!result || selectedFixes.size === 0) return;
    setApplying(true);
    setError(null);
    try {
      const fixes = Array.from(selectedFixes).map((i) => ({
        column: result.suggested_fixes[i].column,
        value: result.suggested_fixes[i].value,
      }));
      await applyWebFix(jobId, rowIndex, fixes);
      setApplied(true);
      onFixApplied();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to apply");
    } finally {
      setApplying(false);
    }
  };

  const toggleFix = (i: number) => {
    const next = new Set(selectedFixes);
    next.has(i) ? next.delete(i) : next.add(i);
    setSelectedFixes(next);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="p-5 border-b flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-lg font-bold text-visa-navy">Web Research</h3>
            <p className="text-sm text-visa-gray-500 mt-0.5">
              Research &quot;{merchantName}&quot; to find correct data
            </p>
          </div>
          <button onClick={onClose} className="text-visa-gray-400 hover:text-visa-gray-700 text-2xl leading-none">
            &times;
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Context */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
            <span className="font-medium text-amber-800">Violation context:</span>{" "}
            <span className="text-amber-700">{violationContext}</span>
          </div>

          {/* User objective input */}
          {!result && !loading && (
            <div>
              <label className="block text-sm font-medium text-visa-gray-700 mb-1">
                What are you trying to find? (optional)
              </label>
              <textarea
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                placeholder="e.g., Find the correct business address for this merchant..."
                className="w-full border border-visa-gray-300 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-visa-navy/30"
                rows={2}
              />
              <button
                onClick={handleResearch}
                disabled={loading}
                className="mt-3 px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Search & Analyze
              </button>
            </div>
          )}

          {/* Loading state */}
          {loading && (
            <div className="text-center py-8">
              <svg className="animate-spin h-8 w-8 mx-auto text-blue-600 mb-3" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              <p className="text-visa-gray-500 text-sm">Searching and analyzing...</p>
              <p className="text-visa-gray-400 text-xs mt-1">This may take 10-20 seconds</p>
            </div>
          )}

          {/* Results */}
          {result && (
            <>
              {/* Search queries used */}
              {result.search_queries_used.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-visa-gray-400 uppercase tracking-wider mb-1">
                    Search Queries
                  </h4>
                  <div className="flex flex-wrap gap-1">
                    {result.search_queries_used.map((q, i) => (
                      <span key={i} className="px-2 py-0.5 bg-visa-gray-100 text-visa-gray-600 rounded text-xs">
                        {q}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Analysis */}
              {result.raw_analysis && (
                <div>
                  <h4 className="text-xs font-medium text-visa-gray-400 uppercase tracking-wider mb-1">
                    Analysis
                  </h4>
                  <div className="bg-visa-gray-50 rounded-lg p-3 text-sm text-visa-gray-700 whitespace-pre-line">
                    {result.raw_analysis}
                  </div>
                </div>
              )}

              {/* Sources */}
              {result.findings.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-visa-gray-400 uppercase tracking-wider mb-1">
                    Sources ({result.findings.length})
                  </h4>
                  <div className="space-y-2">
                    {result.findings.map((f, i) => (
                      <div key={i} className="bg-white border border-visa-gray-200 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`w-2 h-2 rounded-full ${
                            f.relevance === "high" ? "bg-green-500" : f.relevance === "medium" ? "bg-amber-500" : "bg-gray-400"
                          }`}/>
                          <span className="text-sm font-medium text-visa-navy truncate">{f.title}</span>
                        </div>
                        <p className="text-xs text-visa-gray-500 mb-1">{f.snippet}</p>
                        {f.source && f.source !== "llm_knowledge" && (
                          <a href={f.source} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline truncate block">
                            {f.source}
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Suggested fixes */}
              {result.suggested_fixes.length > 0 && !applied && (
                <div>
                  <h4 className="text-xs font-medium text-visa-gray-400 uppercase tracking-wider mb-2">
                    Suggested Fixes
                  </h4>
                  <div className="space-y-2">
                    {result.suggested_fixes.map((fix, i) => (
                      <div
                        key={i}
                        className={`border rounded-lg p-3 flex items-start gap-3 transition ${
                          selectedFixes.has(i) ? "border-green-300 bg-green-50/50" : "border-visa-gray-200"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedFixes.has(i)}
                          onChange={() => toggleFix(i)}
                          className="mt-0.5 rounded border-gray-300"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm text-visa-navy">{fix.column}</span>
                            <span className="text-visa-gray-400">&rarr;</span>
                            <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded text-xs font-medium truncate">
                              {fix.value}
                            </span>
                          </div>
                          <p className="text-xs text-visa-gray-500 mt-1">{fix.reasoning}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {applied && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                  <p className="text-green-700 font-semibold">Fixes applied successfully!</p>
                </div>
              )}

              {result.suggested_fixes.length === 0 && result.findings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
                  <p className="text-amber-700 text-sm">
                    No specific fixes could be suggested from the research. You may need to manually update the data based on the findings above.
                  </p>
                </div>
              )}
            </>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-visa-gray-50 flex items-center justify-between shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-visa-gray-600 hover:text-visa-gray-800">
            Close
          </button>
          {result && result.suggested_fixes.length > 0 && !applied && (
            <button
              onClick={handleApplyFixes}
              disabled={applying || selectedFixes.size === 0}
              className="px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition"
            >
              {applying ? "Applying..." : `Accept ${selectedFixes.size} Fix${selectedFixes.size !== 1 ? "es" : ""}`}
            </button>
          )}
          {!result && !loading && (
            <button
              onClick={handleResearch}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
            >
              Start Research
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
