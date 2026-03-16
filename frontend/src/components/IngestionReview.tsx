"use client";

import { useState, useEffect, useCallback } from "react";
import type { QualityReport, SchemaMapping, ViolationRuleInfo } from "@/lib/types";
import {
  getIngestionQuality,
  getSchemaMapping,
  getViolationRules,
  continuePipeline,
  updateSchemaMapping,
} from "@/lib/api";
import { DEFAULT_UNCHECKED_VIOLATIONS } from "@/lib/constants";
import DQReport from "./DQReport";
import SchemaMapEditor from "./SchemaMapEditor";
import ViolationRuleSelector from "./ViolationRuleSelector";

interface Props {
  jobId: string;
  onContinue: () => void;
}

type Tab = "dq" | "mapping" | "violations";

export default function IngestionReview({ jobId, onContinue }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("mapping");
  const [dqReport, setDqReport] = useState<QualityReport | null>(null);
  const [mapping, setMapping] = useState<SchemaMapping | null>(null);
  const [rules, setRules] = useState<ViolationRuleInfo[]>([]);
  const [selectedViolations, setSelectedViolations] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [continuing, setContinuing] = useState(false);
  const [mappingSaved, setMappingSaved] = useState(false);
  const [gapAccepted, setGapAccepted] = useState(false);
  const [userInstructions, setUserInstructions] = useState("");
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");

  // Load all data on mount
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [dq, schema, violRules] = await Promise.all([
          getIngestionQuality(jobId),
          getSchemaMapping(jobId),
          getViolationRules(),
        ]);
        setDqReport(dq);
        setMapping(schema);
        setRules(violRules);

        // Initialize violation selection: all except DEFAULT_UNCHECKED
        const defaultSelected = new Set(
          violRules
            .map((r) => r.id)
            .filter((id) => !DEFAULT_UNCHECKED_VIOLATIONS.has(id))
        );
        setSelectedViolations(defaultSelected);
      } catch (e) {
        console.error("Failed to load ingestion data:", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [jobId]);

  const hasUnmappedRequired =
    mapping && mapping.unmapped_required.length > 0;

  const canContinue = !hasUnmappedRequired || gapAccepted;

  const handleContinue = async () => {
    if (!canContinue) return;
    setContinuing(true);
    try {
      await continuePipeline(
        jobId,
        Array.from(selectedViolations),
        userInstructions.trim() || undefined,
        saveAsTemplate,
        saveAsTemplate ? (templateName.trim() || undefined) : undefined
      );
      onContinue();
    } catch (e) {
      console.error("Failed to continue pipeline:", e);
      setContinuing(false);
    }
  };

  const handleSaveMapping = useCallback(
    async (updated: SchemaMapping) => {
      try {
        await updateSchemaMapping(jobId, updated);
        setMapping(updated);
        setMappingSaved(true);
        setTimeout(() => setMappingSaved(false), 3000);
      } catch (e) {
        console.error("Failed to save mapping:", e);
      }
    },
    [jobId]
  );

  const handleToggleViolation = (ruleId: string) => {
    setSelectedViolations((prev) => {
      const next = new Set(prev);
      if (next.has(ruleId)) next.delete(ruleId);
      else next.add(ruleId);
      return next;
    });
  };

  const handleSelectAllViolations = () => {
    setSelectedViolations(new Set(rules.map((r) => r.id)));
  };

  const handleSelectDefaultViolations = () => {
    setSelectedViolations(
      new Set(
        rules
          .map((r) => r.id)
          .filter((id) => !DEFAULT_UNCHECKED_VIOLATIONS.has(id))
      )
    );
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <svg
          className="animate-spin h-8 w-8 mx-auto text-visa-navy mb-3"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
            fill="none"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        <p className="text-visa-gray-500">Loading ingestion results...</p>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; badge?: string }[] = [
    {
      key: "mapping",
      label: "Schema Mapping",
      badge: hasUnmappedRequired
        ? `${mapping!.unmapped_required.length} gaps`
        : undefined,
    },
    { key: "dq", label: "Input Data Quality" },
    {
      key: "violations",
      label: "Violation Rules",
      badge: `${selectedViolations.size}/${rules.length}`,
    },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-visa-gold/10 border border-visa-gold/30 rounded-lg p-4">
        <h2 className="text-lg font-bold text-visa-navy flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          Ingestion Review
        </h2>
        <p className="text-sm text-visa-gray-600 mt-1">
          Review the data quality and schema mapping before proceeding. Approve to continue the pipeline.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-visa-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${
              activeTab === tab.key
                ? "border-visa-navy text-visa-navy"
                : "border-transparent text-visa-gray-500 hover:text-visa-gray-700"
            }`}
          >
            {tab.label}
            {tab.badge && (
              <span
                className={`ml-2 px-1.5 py-0.5 text-xs rounded-full ${
                  tab.key === "mapping" && hasUnmappedRequired
                    ? "bg-red-100 text-red-700"
                    : "bg-visa-gray-100 text-visa-gray-600"
                }`}
              >
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-lg border border-visa-gray-200 p-4">
        {activeTab === "dq" && dqReport && <DQReport report={dqReport} />}
        {activeTab === "dq" && !dqReport && (
          <p className="text-visa-gray-500 text-sm py-4 text-center">
            No data quality report available.
          </p>
        )}

        {activeTab === "mapping" && mapping && (
          <div className="space-y-4">
            <SchemaMapEditor
              mapping={mapping}
              onUpdate={handleSaveMapping}
              editable
            />
            {mappingSaved && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-green-700 text-sm flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                Mapping saved successfully
              </div>
            )}
          </div>
        )}
        {activeTab === "mapping" && !mapping && (
          <p className="text-visa-gray-500 text-sm py-4 text-center">
            No schema mapping available.
          </p>
        )}

        {activeTab === "violations" && (
          <ViolationRuleSelector
            rules={rules}
            selected={selectedViolations}
            onToggle={handleToggleViolation}
            onSelectAll={handleSelectAllViolations}
            onSelectDefaults={handleSelectDefaultViolations}
          />
        )}
      </div>

      {/* Unmapped required fields warning */}
      {hasUnmappedRequired && !gapAccepted && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-red-800">
                Missing Required AMMF Columns
              </h4>
              <p className="text-sm text-red-700 mt-1">
                The following required columns have no source mapping:{" "}
                <strong>{mapping!.unmapped_required.join(", ")}</strong>
              </p>
              <p className="text-xs text-red-600 mt-2">
                You can upload additional data, edit the mapping, or accept
                the gaps to proceed.
              </p>
              <button
                onClick={() => setGapAccepted(true)}
                className="mt-3 px-4 py-1.5 text-xs font-medium bg-red-100 text-red-800 rounded-lg hover:bg-red-200 transition"
              >
                Accept Gaps & Allow Proceed
              </button>
            </div>
          </div>
        </div>
      )}

      {hasUnmappedRequired && gapAccepted && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-700 text-sm">
          Gaps accepted — you may proceed despite unmapped required columns.
        </div>
      )}

      {/* User Instructions for SQL Generation */}
      <div className="bg-white rounded-lg border border-visa-gray-200 p-4">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-visa-navy flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          <div className="flex-1">
            <h4 className="text-sm font-semibold text-visa-navy">Notes for SQL Generation</h4>
            <p className="text-xs text-visa-gray-500 mt-0.5">
              Optional — provide any specific instructions for the AI when generating the transformation SQL.
            </p>
            <textarea
              value={userInstructions}
              onChange={(e) => setUserInstructions(e.target.value)}
              placeholder="e.g., Filter out rows where status is 'inactive', use LEFT JOIN for address table, date format should be YYYYMMDD, country code is always 356..."
              className="mt-2 w-full border border-visa-gray-300 rounded-lg px-3 py-2 text-sm text-visa-gray-700 placeholder:text-visa-gray-400 focus:outline-none focus:ring-2 focus:ring-visa-navy/30 focus:border-visa-navy resize-y min-h-[60px]"
              rows={2}
            />
          </div>
        </div>
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
              Save this mapping as a template
            </span>
            <p className="text-xs text-visa-gray-500 mt-0.5">
              Future uploads with the same data structure will automatically use this mapping, skipping the review step.
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

      {/* Continue button */}
      <button
        onClick={handleContinue}
        disabled={!canContinue || continuing}
        className="w-full py-3 bg-visa-navy text-white rounded-lg font-semibold text-sm hover:bg-visa-navy/90 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
      >
        {continuing ? (
          <>
            <svg
              className="animate-spin h-4 w-4"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Continuing Pipeline...
          </>
        ) : (
          <>
            Approve & Continue Pipeline
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 7l5 5m0 0l-5 5m5-5H6"
              />
            </svg>
          </>
        )}
      </button>
    </div>
  );
}
