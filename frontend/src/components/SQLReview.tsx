"use client";

import { useState, useEffect } from "react";
import { getGeneratedSQL, approveSql } from "@/lib/api";

interface Props {
  jobId: string;
  onContinue: () => void;
}

export default function SQLReview({ jobId, onContinue }: Props) {
  const [sql, setSQL] = useState<string>("");
  const [originalSql, setOriginalSql] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");

  useEffect(() => {
    getGeneratedSQL(jobId)
      .then((data) => {
        setSQL(data.sql || "");
        setOriginalSql(data.sql || "");
      })
      .finally(() => setLoading(false));
  }, [jobId]);

  const isEdited = sql.trim() !== originalSql.trim();

  const handleApprove = async () => {
    setApproving(true);
    try {
      await approveSql(
        jobId,
        isEdited ? sql.trim() : undefined,
        saveAsTemplate,
        saveAsTemplate ? (templateName.trim() || undefined) : undefined
      );
      onContinue();
    } catch (e) {
      console.error("Failed to approve SQL:", e);
      setApproving(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <svg className="animate-spin h-8 w-8 mx-auto text-visa-navy mb-3" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p className="text-visa-gray-500">Loading generated SQL...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h2 className="text-lg font-bold text-visa-navy flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
          SQL Review
        </h2>
        <p className="text-sm text-blue-700 mt-1">
          Review the generated SQL query before execution. You can edit it if needed, or approve as-is.
        </p>
      </div>

      {/* SQL Display / Editor */}
      <div className="bg-white rounded-lg border border-visa-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 bg-visa-gray-50 border-b border-visa-gray-200">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-visa-navy">Generated DuckDB Query</span>
            {isEdited && (
              <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">
                Edited
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {editing && isEdited && (
              <button
                onClick={() => { setSQL(originalSql); }}
                className="px-3 py-1 text-xs font-medium text-visa-gray-600 bg-visa-gray-100 rounded hover:bg-visa-gray-200 transition"
              >
                Reset to Original
              </button>
            )}
            <button
              onClick={() => setEditing(!editing)}
              className={`px-3 py-1 text-xs font-medium rounded transition ${
                editing
                  ? "bg-visa-navy text-white"
                  : "bg-visa-gray-100 text-visa-gray-700 hover:bg-visa-gray-200"
              }`}
            >
              {editing ? "Done Editing" : "Edit SQL"}
            </button>
            <button
              onClick={() => { navigator.clipboard.writeText(sql); }}
              className="px-3 py-1 text-xs font-medium text-visa-gray-600 bg-visa-gray-100 rounded hover:bg-visa-gray-200 transition"
            >
              Copy
            </button>
          </div>
        </div>

        {editing ? (
          <textarea
            value={sql}
            onChange={(e) => setSQL(e.target.value)}
            className="w-full bg-visa-gray-900 text-green-400 font-mono text-sm p-6 leading-relaxed resize-y min-h-[300px] max-h-[600px] focus:outline-none"
            spellCheck={false}
          />
        ) : (
          <div className="bg-visa-gray-900 p-6 overflow-x-auto max-h-[500px] overflow-y-auto">
            <pre className="text-sm text-green-400 font-mono whitespace-pre-wrap leading-relaxed">
              {sql}
            </pre>
          </div>
        )}
      </div>

      {/* Info about the query */}
      <div className="bg-white rounded-lg border border-visa-gray-200 p-4">
        <h3 className="font-semibold text-visa-navy text-sm mb-2">Query Details</h3>
        <ul className="text-xs text-visa-gray-500 space-y-1">
          <li>• Generated by Claude AI based on schema mapping and relationship discovery</li>
          <li>• Produces all 31 AMMF columns with correct naming and order</li>
          <li>• Uses LEFT JOINs for optional tables and COALESCE for null handling</li>
          <li>• Validated via trial execution with up to 3 retry attempts</li>
          {isEdited && (
            <li className="text-amber-600 font-medium">• You have edited this query — your version will be executed</li>
          )}
        </ul>
      </div>

      {/* Save as Template */}
      <div className="bg-white rounded-lg border border-visa-gray-200 p-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={saveAsTemplate}
            onChange={(e) => setSaveAsTemplate(e.target.checked)}
            className="mt-1 h-4 w-4 accent-[#1A1F71]"
          />
          <div className="flex-1">
            <span className="text-sm font-semibold text-visa-navy">
              Save mapping + SQL as a template
            </span>
            <p className="text-xs text-visa-gray-500 mt-0.5">
              Future uploads with the same data structure will auto-apply the schema mapping and reuse this SQL query, skipping both review steps.
            </p>
            {saveAsTemplate && (
              <input
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Template name (optional, e.g. 'Q1 Acquirer Feed')"
                className="mt-2 w-full border border-visa-gray-300 rounded-lg px-3 py-2 text-sm text-visa-gray-700 placeholder:text-visa-gray-400 focus:outline-none focus:ring-2 focus:ring-visa-navy/30 focus:border-visa-navy"
              />
            )}
          </div>
        </label>
      </div>

      {/* Approve button */}
      <button
        onClick={handleApprove}
        disabled={approving || !sql.trim()}
        className="w-full py-3 bg-visa-navy text-white rounded-lg font-semibold text-sm hover:bg-visa-navy/90 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
      >
        {approving ? (
          <>
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Executing...
          </>
        ) : (
          <>
            Approve & Execute SQL
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </>
        )}
      </button>
    </div>
  );
}
