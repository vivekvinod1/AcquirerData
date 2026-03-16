"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import PipelineStepper from "@/components/PipelineStepper";
import IngestionReview from "@/components/IngestionReview";
import ChatPanel from "@/components/ChatPanel";
import ViolationRuleSelector from "@/components/ViolationRuleSelector";
import { getPipelineStatus, runPipeline, getViolationRules, checkTemplateMatch } from "@/lib/api";
import { DEFAULT_UNCHECKED_VIOLATIONS } from "@/lib/constants";
import type { PipelineStatus, ViolationRuleInfo, TemplateMatch } from "@/lib/types";

/** Steps shown in the pre-start selector (validation-only mode) */
const AVAILABLE_STEPS = [
  { key: "relationships", label: "Relationship Discovery", desc: "Find PKs, FKs, and join paths" },
  { key: "quality", label: "Data Quality", desc: "Profile null rates, types, anomalies" },
  { key: "query_generation", label: "Query Generation", desc: "Generate AMMF transformation SQL" },
  { key: "executing", label: "Execute Query", desc: "Run SQL to produce AMMF output" },
  { key: "validation", label: "Violation Checks", desc: "Run Visa compliance rules" },
];

export default function PipelineDashboard({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = use(params);
  const router = useRouter();
  const [status, setStatus] = useState<PipelineStatus | null>(null);
  const [running, setRunning] = useState(false);
  const [selectedSteps, setSelectedSteps] = useState<Set<string>>(
    new Set(AVAILABLE_STEPS.map((s) => s.key))
  );
  const [mode, setMode] = useState<"full" | "validation_only">("full");
  const [violationRules, setViolationRules] = useState<ViolationRuleInfo[]>([]);
  const [selectedViolations, setSelectedViolations] = useState<Set<string>>(new Set());
  const [templateMatch, setTemplateMatch] = useState<TemplateMatch | null>(null);
  const [forceReview, setForceReview] = useState(false);

  const pollStatus = useCallback(async () => {
    try {
      const s = await getPipelineStatus(jobId);
      setStatus(s);
      return s;
    } catch {
      return null;
    }
  }, [jobId]);

  useEffect(() => {
    pollStatus();
    // Load violation rules for the selector
    getViolationRules()
      .then((rules) => {
        setViolationRules(rules);
        // Default: all checked except V5, V11, V12
        setSelectedViolations(
          new Set(rules.map((r) => r.id).filter((id) => !DEFAULT_UNCHECKED_VIOLATIONS.has(id)))
        );
      })
      .catch(() => {});
    checkTemplateMatch(jobId)
      .then((match) => setTemplateMatch(match))
      .catch(() => {});
  }, [pollStatus, jobId]);

  // Polling: runs while pipeline is active, stops at terminal + awaiting_approval states
  useEffect(() => {
    if (!running) return;
    const interval = setInterval(async () => {
      const s = await pollStatus();
      if (
        s &&
        (s.step === "complete" ||
          s.step === "error" ||
          s.step === "awaiting_approval")
      ) {
        setRunning(false);
        clearInterval(interval);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [running, pollStatus]);

  const toggleStep = (key: string) => {
    setSelectedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectValidationOnly = () => {
    setMode("validation_only");
    setSelectedSteps(new Set(["validation"]));
  };

  const selectFullPipeline = () => {
    setMode("full");
    setSelectedSteps(new Set(AVAILABLE_STEPS.map((s) => s.key)));
  };

  const handleStart = async () => {
    setRunning(true);
    const violations = Array.from(selectedViolations);
    if (mode === "full") {
      // Full pipeline: Phase 1 (ingestion) runs automatically
      // CIB/BIN values are auto-detected from the uploaded data
      await runPipeline(jobId, undefined, undefined, violations, forceReview);
    } else {
      // Validation-only mode: pass selected steps + violations
      const steps = Array.from(selectedSteps);
      await runPipeline(jobId, undefined, steps, violations, false);
    }
  };

  /** Called when user approves ingestion & continues pipeline */
  const handleContinue = () => {
    setRunning(true);
    // IngestionReview calls continuePipeline() itself; we just need to resume polling
  };

  const step = status?.step || "uploaded";
  const isComplete = step === "complete";
  const isError = step === "error";
  const isAwaitingApproval = step === "awaiting_approval";

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-visa-navy">Pipeline Dashboard</h2>
          <p className="text-sm text-visa-gray-500">Job: {jobId}</p>
        </div>
        {isComplete && (
          <span className="px-4 py-2 bg-green-100 text-green-800 rounded-full font-semibold text-sm">Complete</span>
        )}
        {isError && (
          <span className="px-4 py-2 bg-red-100 text-red-800 rounded-full font-semibold text-sm">Error</span>
        )}
        {isAwaitingApproval && (
          <span className="px-4 py-2 bg-amber-100 text-amber-800 rounded-full font-semibold text-sm">
            Awaiting Review
          </span>
        )}
      </div>

      <PipelineStepper currentStep={step} progressPct={status?.progress_pct || 0} />

      {/* ── Awaiting Approval: Show Ingestion Review ── */}
      {isAwaitingApproval && !running && (
        <IngestionReview jobId={jobId} onContinue={handleContinue} />
      )}

      {/* ── Initial Upload State: Step Selector + Config ── */}
      {step === "uploaded" && !running && (
        <div className="space-y-6">
          {/* Template Match Banner */}
          {templateMatch?.match && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-green-800">
                    Saved Template Match: &ldquo;{templateMatch.template_name}&rdquo;
                  </h4>
                  <p className="text-sm text-green-700 mt-1">
                    A saved mapping template matches your uploaded data. The schema review step will be skipped automatically.
                  </p>
                  <label className="flex items-center gap-2 mt-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={forceReview}
                      onChange={(e) => setForceReview(e.target.checked)}
                      className="h-4 w-4 accent-[#1A1F71]"
                    />
                    <span className="text-sm text-green-800">Force manual review (ignore saved template)</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Mode Selector */}
          <div className="bg-white rounded-lg shadow-sm border border-visa-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-visa-navy">Pipeline Mode</h3>
                <p className="text-sm text-visa-gray-500">Choose how to process your data.</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={selectFullPipeline}
                  className={`px-4 py-2 text-sm rounded-lg font-medium transition ${
                    mode === "full"
                      ? "bg-visa-navy text-white"
                      : "bg-visa-gray-100 text-visa-gray-600 hover:bg-visa-gray-200"
                  }`}
                >
                  Full Pipeline
                </button>
                <button
                  onClick={selectValidationOnly}
                  className={`px-4 py-2 text-sm rounded-lg font-medium transition ${
                    mode === "validation_only"
                      ? "bg-visa-gold text-visa-navy"
                      : "bg-visa-gray-100 text-visa-gray-600 hover:bg-visa-gray-200"
                  }`}
                >
                  Violations Only
                </button>
              </div>
            </div>

            {mode === "full" ? (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>Full Pipeline</strong> will run data quality checks on your uploaded files, perform AI schema mapping,
                  then pause for your review before proceeding with transformation and violation checks.
                </p>
                <ul className="mt-2 text-xs text-blue-700 space-y-1 ml-4 list-disc">
                  <li>Phase 1 (automatic): Input DQ + Schema Mapping + Completeness Check</li>
                  <li>Human review gate: Verify mapping, select violation rules</li>
                  <li>Phase 2 (on approval): Relationships + Quality + SQL Gen + Execute + Violations</li>
                </ul>
              </div>
            ) : (
              /* Validation-only: show step checkboxes */
              <div className="space-y-3">
                <p className="text-sm text-visa-gray-500">
                  Select specific steps to run. Use this if you already have a pre-built AMMF file.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {AVAILABLE_STEPS.map((s) => (
                    <label
                      key={s.key}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${
                        selectedSteps.has(s.key)
                          ? "border-visa-navy bg-blue-50"
                          : "border-visa-gray-200 bg-visa-gray-50 opacity-60"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedSteps.has(s.key)}
                        onChange={() => toggleStep(s.key)}
                        className="mt-0.5 h-4 w-4 accent-[#1A1F71]"
                      />
                      <div>
                        <div className="text-sm font-medium text-visa-navy">{s.label}</div>
                        <div className="text-xs text-visa-gray-500">{s.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-visa-gray-500">
                  {selectedSteps.size} of {AVAILABLE_STEPS.length} steps selected
                </p>
              </div>
            )}
          </div>

          {/* Violation Rule Selector */}
          {violationRules.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border border-visa-gray-200 p-6">
              <div className="mb-4">
                <h3 className="font-semibold text-visa-navy">Violation Rules to Execute</h3>
                <p className="text-sm text-visa-gray-500 mt-1">
                  Select which Visa compliance rules to check. V5, V11, V12 are unchecked by default.
                  {mode === "full" && " You can also adjust these during the review step."}
                </p>
              </div>
              <ViolationRuleSelector
                rules={violationRules}
                selected={selectedViolations}
                onToggle={(id) => {
                  setSelectedViolations((prev) => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  });
                }}
                onSelectAll={() => setSelectedViolations(new Set(violationRules.map((r) => r.id)))}
                onSelectDefaults={() =>
                  setSelectedViolations(
                    new Set(violationRules.map((r) => r.id).filter((id) => !DEFAULT_UNCHECKED_VIOLATIONS.has(id)))
                  )
                }
              />
            </div>
          )}

          <button
            onClick={handleStart}
            disabled={mode === "validation_only" && selectedSteps.size === 0}
            className="w-full py-3 bg-visa-navy text-white font-semibold rounded-lg hover:bg-visa-blue transition-colors disabled:opacity-50"
          >
            {mode === "full" ? "Start Pipeline" : `Start Pipeline (${selectedSteps.size} steps)`}
          </button>
        </div>
      )}

      {/* Navigation cards — show after ingestion or when progress is past 25% */}
      {(isComplete || isAwaitingApproval || (status?.progress_pct ?? 0) > 25) && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <button onClick={() => router.push(`/pipeline/${jobId}/schema`)}
            className="p-4 bg-white rounded-lg shadow-sm border border-visa-gray-200 hover:border-visa-gold text-left transition">
            <div className="text-sm font-semibold text-visa-navy">Schema Mapping</div>
            <p className="text-xs text-visa-gray-500 mt-1">View column mappings</p>
          </button>
          <button onClick={() => router.push(`/pipeline/${jobId}/quality`)}
            disabled={!status || status.progress_pct < 50}
            className="p-4 bg-white rounded-lg shadow-sm border border-visa-gray-200 hover:border-visa-gold text-left transition disabled:opacity-50">
            <div className="text-sm font-semibold text-visa-navy">Data Quality</div>
            <p className="text-xs text-visa-gray-500 mt-1">View DQ report</p>
          </button>
          <button onClick={() => router.push(`/pipeline/${jobId}/sql`)}
            disabled={!status || status.progress_pct < 65}
            className="p-4 bg-white rounded-lg shadow-sm border border-visa-gray-200 hover:border-visa-gold text-left transition disabled:opacity-50">
            <div className="text-sm font-semibold text-visa-navy">SQL Query</div>
            <p className="text-xs text-visa-gray-500 mt-1">View generated SQL</p>
          </button>
          <button onClick={() => router.push(`/pipeline/${jobId}/violations`)}
            disabled={!status || status.progress_pct < 85}
            className="p-4 bg-white rounded-lg shadow-sm border border-visa-gray-200 hover:border-visa-gold text-left transition disabled:opacity-50">
            <div className="text-sm font-semibold text-visa-navy">Violations</div>
            <p className="text-xs text-visa-gray-500 mt-1">View violation checks</p>
          </button>
          <button onClick={() => router.push(`/pipeline/${jobId}/ammf`)}
            disabled={!isComplete}
            className="p-4 bg-white rounded-lg shadow-sm border border-visa-gray-200 hover:border-visa-gold text-left transition disabled:opacity-50">
            <div className="text-sm font-semibold text-visa-navy">AMMF Output</div>
            <p className="text-xs text-visa-gray-500 mt-1">Preview & download</p>
          </button>
          <button onClick={() => router.push(`/pipeline/${jobId}/llm-logs`)}
            className="p-4 bg-white rounded-lg shadow-sm border border-visa-gold hover:bg-visa-light-gold text-left transition">
            <div className="text-sm font-semibold text-visa-gold">LLM Control Panel</div>
            <p className="text-xs text-visa-gray-500 mt-1">Calls, tokens, costs</p>
          </button>
        </div>
      )}

      {/* Log messages */}
      {status?.messages && status.messages.length > 0 && (
        <div className="bg-visa-gray-900 rounded-lg p-4 max-h-64 overflow-y-auto">
          <h3 className="text-visa-gold text-sm font-semibold mb-2">Pipeline Log</h3>
          {status.messages.map((msg, i) => (
            <p key={i} className="text-visa-gray-300 text-xs font-mono">{msg}</p>
          ))}
        </div>
      )}

      {/* Floating Chat Panel — always available once job exists */}
      <ChatPanel jobId={jobId} />
    </div>
  );
}
