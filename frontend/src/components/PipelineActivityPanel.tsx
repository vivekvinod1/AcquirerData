"use client";

import React from "react";

interface PipelineActivityPanelProps {
  currentStep: string;
  messages: string[];
}

const ACTIVE_STEPS = new Set([
  "ingestion",
  "relationships",
  "quality",
  "query_generation",
  "executing",
  "validation",
]);

const STEP_CONFIG: Record<
  string,
  { title: string; subtitle: string }
> = {
  ingestion: {
    title: "Analyzing Your Data",
    subtitle: "Running data quality checks and AI schema mapping...",
  },
  relationships: {
    title: "Discovering Relationships",
    subtitle: "Finding primary keys, foreign keys, and join paths...",
  },
  quality: {
    title: "Profiling Data Quality",
    subtitle: "Analyzing null rates, types, and anomalies...",
  },
  query_generation: {
    title: "Generating Transformation SQL",
    subtitle: "AI is writing the AMMF transformation query...",
  },
  executing: {
    title: "Running Transformation",
    subtitle: "Executing SQL query to produce AMMF output...",
  },
  validation: {
    title: "Running Compliance Checks",
    subtitle: "Checking Visa violation rules...",
  },
};

/* ------------------------------------------------------------------ */
/*  Per-step animation components                                      */
/* ------------------------------------------------------------------ */

function IngestionAnimation() {
  return (
    <div className="relative flex flex-col items-center justify-center gap-2 h-[120px] w-full max-w-[260px] mx-auto overflow-hidden">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-4 rounded"
          style={{
            width: `${180 - i * 20}px`,
            backgroundColor: "#E5E7EB",
          }}
        />
      ))}
      <div
        className="absolute left-1/2 -translate-x-1/2 h-5 rounded"
        style={{
          width: "220px",
          background:
            "linear-gradient(180deg, transparent 0%, rgba(247,182,0,0.35) 50%, transparent 100%)",
          animation: "scanSweep 2.5s ease-in-out infinite",
        }}
      />
      <style>{`
        @keyframes scanSweep {
          0%   { top: -8px; }
          50%  { top: calc(100% - 12px); }
          100% { top: -8px; }
        }
      `}</style>
    </div>
  );
}

function RelationshipsAnimation() {
  return (
    <div className="relative flex items-center justify-center h-[120px] w-full max-w-[280px] mx-auto">
      <svg viewBox="0 0 280 100" className="w-full h-full">
        {/* Circles representing tables */}
        <circle cx="50" cy="50" r="18" fill="#1A1F71" opacity="0.15" stroke="#1A1F71" strokeWidth="2" />
        <circle cx="140" cy="30" r="18" fill="#1A1F71" opacity="0.15" stroke="#1A1F71" strokeWidth="2" />
        <circle cx="230" cy="55" r="18" fill="#1A1F71" opacity="0.15" stroke="#1A1F71" strokeWidth="2" />

        {/* Table labels */}
        <text x="50" y="54" textAnchor="middle" fontSize="10" fill="#1A1F71" fontWeight="600">T1</text>
        <text x="140" y="34" textAnchor="middle" fontSize="10" fill="#1A1F71" fontWeight="600">T2</text>
        <text x="230" y="59" textAnchor="middle" fontSize="10" fill="#1A1F71" fontWeight="600">T3</text>

        {/* Animated dashed lines */}
        <line x1="68" y1="45" x2="122" y2="35" stroke="#F7B600" strokeWidth="2" strokeDasharray="6 4" style={{ animation: "dashDraw 2s ease-in-out infinite" }} />
        <line x1="158" y1="35" x2="212" y2="50" stroke="#F7B600" strokeWidth="2" strokeDasharray="6 4" style={{ animation: "dashDraw 2s ease-in-out infinite 0.5s" }} />
        <line x1="68" y1="55" x2="212" y2="60" stroke="#F7B600" strokeWidth="2" strokeDasharray="6 4" style={{ animation: "dashDraw 2s ease-in-out infinite 1s" }} />
      </svg>
      <style>{`
        @keyframes dashDraw {
          0%   { stroke-dashoffset: 40; opacity: 0.3; }
          50%  { stroke-dashoffset: 0;  opacity: 1; }
          100% { stroke-dashoffset: -40; opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}

function QualityAnimation() {
  const heights = [60, 85, 45, 72];
  return (
    <div className="flex items-end justify-center gap-4 h-[120px] w-full max-w-[200px] mx-auto pb-2">
      {heights.map((h, i) => (
        <div key={i} className="flex flex-col items-center gap-1">
          <div
            className="w-8 rounded-t"
            style={{
              backgroundColor: i % 2 === 0 ? "#1A1F71" : "#F7B600",
              animation: `barGrow${i} 2.5s ease-in-out infinite`,
              height: `${h}px`,
              transformOrigin: "bottom",
            }}
          />
        </div>
      ))}
      <style>{`
        @keyframes barGrow0 {
          0%   { transform: scaleY(0); }
          20%  { transform: scaleY(1); }
          80%  { transform: scaleY(1); }
          100% { transform: scaleY(0); }
        }
        @keyframes barGrow1 {
          0%   { transform: scaleY(0); }
          10%  { transform: scaleY(0); }
          30%  { transform: scaleY(1); }
          80%  { transform: scaleY(1); }
          100% { transform: scaleY(0); }
        }
        @keyframes barGrow2 {
          0%   { transform: scaleY(0); }
          20%  { transform: scaleY(0); }
          40%  { transform: scaleY(1); }
          80%  { transform: scaleY(1); }
          100% { transform: scaleY(0); }
        }
        @keyframes barGrow3 {
          0%   { transform: scaleY(0); }
          30%  { transform: scaleY(0); }
          50%  { transform: scaleY(1); }
          80%  { transform: scaleY(1); }
          100% { transform: scaleY(0); }
        }
      `}</style>
    </div>
  );
}

function QueryGenerationAnimation() {
  const codeLine = "SELECT t.*, CASE WHEN ...";
  return (
    <div className="flex items-center justify-center h-[120px] w-full max-w-[320px] mx-auto">
      <div
        className="w-full rounded-lg px-4 py-3 font-mono text-sm"
        style={{ backgroundColor: "#0F172A", color: "#94A3B8" }}
      >
        <div className="text-xs opacity-50 mb-2">-- ammf_transform.sql</div>
        <div className="relative inline-block whitespace-nowrap overflow-hidden" style={{ animation: "typeReveal 3.5s steps(26) infinite" }}>
          <span style={{ color: "#F7B600" }}>SELECT</span>
          <span> t.*, </span>
          <span style={{ color: "#7DD3FC" }}>CASE</span>
          <span> </span>
          <span style={{ color: "#7DD3FC" }}>WHEN</span>
          <span> ...</span>
          <span
            className="inline-block w-[2px] h-[14px] ml-[1px] align-middle"
            style={{
              backgroundColor: "#F7B600",
              animation: "cursorBlink 0.8s step-end infinite",
            }}
          />
        </div>
        <div className="mt-2 opacity-40 text-xs">FROM acquirer_data t</div>
      </div>
      <style>{`
        @keyframes typeReveal {
          0%   { max-width: 0; }
          70%  { max-width: 300px; }
          85%  { max-width: 300px; }
          100% { max-width: 0; }
        }
        @keyframes cursorBlink {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0; }
        }
      `}</style>
    </div>
  );
}

function ExecutingAnimation() {
  return (
    <div className="flex items-center justify-center h-[120px] w-full max-w-[260px] mx-auto">
      <div className="relative flex items-center gap-6">
        {/* Database icon */}
        <svg width="48" height="56" viewBox="0 0 48 56" fill="none">
          <ellipse cx="24" cy="10" rx="20" ry="8" fill="#1A1F71" opacity="0.2" stroke="#1A1F71" strokeWidth="2" />
          <path d="M4 10v36c0 4.418 8.954 8 20 8s20-3.582 20-8V10" stroke="#1A1F71" strokeWidth="2" fill="none" />
          <ellipse cx="24" cy="28" rx="20" ry="8" fill="none" stroke="#1A1F71" strokeWidth="1" opacity="0.3" />
          <ellipse cx="24" cy="46" rx="20" ry="8" fill="#1A1F71" opacity="0.1" />
        </svg>

        {/* Arrow */}
        <svg width="24" height="20" viewBox="0 0 24 20" fill="none">
          <path d="M0 10h18m0 0l-6-6m6 6l-6 6" stroke="#F7B600" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        {/* Streaming rows */}
        <div className="flex flex-col gap-[6px] overflow-hidden h-[60px] relative">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="flex gap-1"
              style={{
                animation: `rowStream 3s ease-in-out infinite ${i * 0.4}s`,
                opacity: 0,
              }}
            >
              <div className="w-10 h-3 rounded-sm" style={{ backgroundColor: "#1A1F71", opacity: 0.2 }} />
              <div className="w-14 h-3 rounded-sm" style={{ backgroundColor: "#F7B600", opacity: 0.3 }} />
              <div className="w-8 h-3 rounded-sm" style={{ backgroundColor: "#1A1F71", opacity: 0.15 }} />
            </div>
          ))}
        </div>
      </div>
      <style>{`
        @keyframes rowStream {
          0%   { transform: translateX(-20px); opacity: 0; }
          20%  { transform: translateX(0); opacity: 1; }
          80%  { transform: translateX(0); opacity: 1; }
          100% { transform: translateX(20px); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

function ValidationAnimation() {
  const items = [
    "Field presence check",
    "Visa format rules",
    "Amount validation",
    "MCC code check",
  ];
  return (
    <div className="flex flex-col gap-2 h-[120px] justify-center w-full max-w-[260px] mx-auto">
      {items.map((label, i) => (
        <div key={i} className="flex items-center gap-2">
          <div
            className="w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0"
            style={{
              borderColor: "#1A1F71",
              animation: `checkAnim 4s ease-in-out infinite`,
              animationDelay: `${i * 0.7}s`,
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              style={{
                animation: `checkFade 4s ease-in-out infinite`,
                animationDelay: `${i * 0.7}s`,
              }}
            >
              <path d="M2 6l3 3 5-5" stroke="#F7B600" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span
            className="text-sm"
            style={{
              color: "#1A1F71",
              animation: `labelFade 4s ease-in-out infinite`,
              animationDelay: `${i * 0.7}s`,
            }}
          >
            {label}
          </span>
        </div>
      ))}
      <style>{`
        @keyframes checkAnim {
          0%, 15%  { border-color: #CBD5E1; background: transparent; }
          25%      { border-color: #1A1F71; background: rgba(26,31,113,0.05); }
          80%      { border-color: #1A1F71; background: rgba(26,31,113,0.05); }
          100%     { border-color: #CBD5E1; background: transparent; }
        }
        @keyframes checkFade {
          0%, 15%  { opacity: 0; }
          25%      { opacity: 1; }
          80%      { opacity: 1; }
          100%     { opacity: 0; }
        }
        @keyframes labelFade {
          0%, 15%  { opacity: 0.4; }
          25%      { opacity: 1; }
          80%      { opacity: 1; }
          100%     { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step-to-animation mapper                                           */
/* ------------------------------------------------------------------ */

const ANIMATION_MAP: Record<string, React.FC> = {
  ingestion: IngestionAnimation,
  relationships: RelationshipsAnimation,
  quality: QualityAnimation,
  query_generation: QueryGenerationAnimation,
  executing: ExecutingAnimation,
  validation: ValidationAnimation,
};

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function PipelineActivityPanel({
  currentStep,
  messages,
}: PipelineActivityPanelProps) {
  if (!ACTIVE_STEPS.has(currentStep)) return null;

  const config = STEP_CONFIG[currentStep];
  const AnimationComponent = ANIMATION_MAP[currentStep];
  const recentMessages = messages.slice(-3);

  if (!config) return null;

  return (
    <div
      className="w-full rounded-xl bg-white shadow-md overflow-hidden"
      style={{ borderLeft: "4px solid #F7B600" }}
    >
      {/* Header */}
      <div className="px-6 pt-5 pb-2">
        <div className="flex items-center gap-2 mb-1">
          <div
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{
              backgroundColor: "#F7B600",
              animation: "pulse 2s ease-in-out infinite",
            }}
          />
          <h3
            className="text-lg font-semibold tracking-tight"
            style={{ color: "#1A1F71" }}
          >
            {config.title}
          </h3>
        </div>
        <p className="text-sm text-gray-500 ml-4">{config.subtitle}</p>
      </div>

      {/* Animation area */}
      <div className="px-6 py-4">
        {AnimationComponent && <AnimationComponent />}
      </div>

      {/* Log messages */}
      {recentMessages.length > 0 && (
        <div
          className="mx-6 mb-5 rounded-lg px-4 py-3"
          style={{ backgroundColor: "#F8FAFC" }}
        >
          <div className="flex flex-col gap-1">
            {recentMessages.map((msg, i) => (
              <div
                key={i}
                className="flex items-start gap-2 text-xs font-mono"
                style={{
                  color: i === recentMessages.length - 1 ? "#1A1F71" : "#94A3B8",
                }}
              >
                <span className="select-none opacity-40 flex-shrink-0">&gt;</span>
                <span className="break-all">{msg}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Global keyframes */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.5; transform: scale(0.85); }
        }
      `}</style>
    </div>
  );
}
