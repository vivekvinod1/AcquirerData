"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import PipelineStepper from "@/components/PipelineStepper";
import { getPipelineStatus, runPipeline } from "@/lib/api";
import type { PipelineStatus, CIBBINConfig } from "@/lib/types";

const AVAILABLE_STEPS = [
  { key: "schema_mapping", label: "Schema Mapping", desc: "Map source columns to AMMF format" },
  { key: "completeness", label: "Completeness Check", desc: "Verify all required fields mapped" },
  { key: "relationships", label: "Relationship Discovery", desc: "Find PKs, FKs, and join paths" },
  { key: "quality", label: "Data Quality", desc: "Profile null rates, types, anomalies" },
  { key: "query_generation", label: "Query Generation", desc: "Generate AMMF transformation SQL" },
  { key: "executing", label: "Execute Query", desc: "Run SQL to produce AMMF output" },
  { key: "validation", label: "Violation Checks", desc: "Run 13 Visa compliance rules" },
];

export default function PipelineDashboard({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = use(params);
  const router = useRouter();
  const [status, setStatus] = useState<PipelineStatus | null>(null);
  const [running, setRunning] = useState(false);
  const [selectedSteps, setSelectedSteps] = useState<Set<string>>(
    new Set(AVAILABLE_STEPS.map((s) => s.key))
  );
  const [cibConfig, setCibConfig] = useState<CIBBINConfig>({
    processor_name: "",
    processor_bin_cib: 0,
    acquirer_name: "",
    acquirer_bid: 0,
    acquirer_bin: 0,
  });

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
  }, [pollStatus]);

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(async () => {
      const s = await pollStatus();
      if (s && (s.step === "complete" || s.step === "error")) {
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

  const selectValidationOnly = () => setSelectedSteps(new Set(["validation"]));
  const selectFullPipeline = () => setSelectedSteps(new Set(AVAILABLE_STEPS.map((s) => s.key)));

  const handleStart = async () => {
    setRunning(true);
    const steps = selectedSteps.size === AVAILABLE_STEPS.length ? undefined : Array.from(selectedSteps);
    await runPipeline(jobId, cibConfig.processor_name ? cibConfig : undefined, steps);
  };

  const step = status?.step || "uploaded";
  const isComplete = step === "complete";
  const isError = step === "error";

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
      </div>

      <PipelineStepper currentStep={step} progressPct={status?.progress_pct || 0} />

      {step === "uploaded" && !running && (
        <div className="space-y-6">
          {/* Step Selector */}
          <div className="bg-white rounded-lg shadow-sm border border-visa-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-visa-navy">Select Pipeline Steps</h3>
                <p className="text-sm text-visa-gray-500">Choose which steps to run. Uncheck steps you don&apos;t need.</p>
              </div>
              <div className="flex gap-2">
                <button onClick={selectFullPipeline} className="px-3 py-1 text-xs rounded-full bg-visa-navy text-white hover:bg-visa-blue">
                  Full Pipeline
                </button>
                <button onClick={selectValidationOnly} className="px-3 py-1 text-xs rounded-full bg-visa-gold text-visa-navy hover:opacity-90">
                  Violations Only
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {AVAILABLE_STEPS.map((s) => (
                <label
                  key={s.key}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${
                    selectedSteps.has(s.key) ? "border-visa-navy bg-blue-50" : "border-visa-gray-200 bg-visa-gray-50 opacity-60"
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
            <p className="text-xs text-visa-gray-500 mt-3">
              {selectedSteps.size} of {AVAILABLE_STEPS.length} steps selected
            </p>
          </div>

          {/* CIB/BIN Config — only show when transform steps are selected */}
          {(selectedSteps.has("query_generation") || selectedSteps.has("executing")) && (
            <div className="bg-white rounded-lg shadow-sm border border-visa-gray-200 p-6">
              <h3 className="font-semibold text-visa-navy mb-4">Configure Processor / Acquirer Details</h3>
              <p className="text-sm text-visa-gray-500 mb-4">
                Optionally configure the CIB/BIN values. Leave blank to auto-detect from uploaded data.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-visa-gray-700 mb-1">Processor Name</label>
                  <input type="text" value={cibConfig.processor_name}
                    onChange={(e) => setCibConfig({ ...cibConfig, processor_name: e.target.value })}
                    className="w-full border border-visa-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="e.g., SwiftSwitch Networks" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-visa-gray-700 mb-1">Processor BIN/CIB</label>
                  <input type="number" value={cibConfig.processor_bin_cib || ""}
                    onChange={(e) => setCibConfig({ ...cibConfig, processor_bin_cib: Number(e.target.value) })}
                    className="w-full border border-visa-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="e.g., 422983" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-visa-gray-700 mb-1">Acquirer Name</label>
                  <input type="text" value={cibConfig.acquirer_name}
                    onChange={(e) => setCibConfig({ ...cibConfig, acquirer_name: e.target.value })}
                    className="w-full border border-visa-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="e.g., Meridian Credit Bank" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-visa-gray-700 mb-1">Acquirer BID</label>
                  <input type="number" value={cibConfig.acquirer_bid || ""}
                    onChange={(e) => setCibConfig({ ...cibConfig, acquirer_bid: Number(e.target.value) })}
                    className="w-full border border-visa-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="e.g., 48364142" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-visa-gray-700 mb-1">Acquirer BIN</label>
                  <input type="number" value={cibConfig.acquirer_bin || ""}
                    onChange={(e) => setCibConfig({ ...cibConfig, acquirer_bin: Number(e.target.value) })}
                    className="w-full border border-visa-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="e.g., 419489" />
                </div>
              </div>
            </div>
          )}

          <button onClick={handleStart} disabled={selectedSteps.size === 0}
            className="w-full py-3 bg-visa-navy text-white font-semibold rounded-lg hover:bg-visa-blue transition-colors disabled:opacity-50">
            Start Pipeline ({selectedSteps.size} steps)
          </button>
        </div>
      )}

      {/* Navigation cards */}
      {(isComplete || (status?.progress_pct ?? 0) > 25) && (
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
    </div>
  );
}
