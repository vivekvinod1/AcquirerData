"use client";
import { PIPELINE_STEPS } from "@/lib/constants";

interface PipelineStepperProps {
  currentStep: string;
  progressPct: number;
}

export default function PipelineStepper({ currentStep, progressPct }: PipelineStepperProps) {
  const currentIdx = PIPELINE_STEPS.findIndex((s) => s.key === currentStep);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        {PIPELINE_STEPS.map((step, i) => {
          const isCompleted = i < currentIdx || currentStep === "complete";
          const isCurrent = i === currentIdx && currentStep !== "complete";
          const isPending = i > currentIdx;

          return (
            <div key={step.key} className="flex flex-col items-center flex-1">
              <div className="flex items-center w-full">
                {i > 0 && (
                  <div className={`h-0.5 flex-1 ${isCompleted ? "bg-visa-navy" : "bg-visa-gray-200"}`} />
                )}
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    isCompleted
                      ? "bg-visa-navy text-white"
                      : isCurrent
                      ? "bg-visa-gold text-white animate-pulse"
                      : "bg-visa-gray-200 text-visa-gray-500"
                  }`}
                >
                  {isCompleted ? "\u2713" : step.icon}
                </div>
                {i < PIPELINE_STEPS.length - 1 && (
                  <div className={`h-0.5 flex-1 ${isCompleted ? "bg-visa-navy" : "bg-visa-gray-200"}`} />
                )}
              </div>
              <span className={`mt-1 text-xs text-center ${
                isCurrent ? "text-visa-gold font-semibold" : isCompleted ? "text-visa-navy" : "text-visa-gray-500"
              }`}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
      <div className="w-full bg-visa-gray-200 rounded-full h-2 mt-4">
        <div
          className="bg-visa-gold h-2 rounded-full transition-all duration-500"
          style={{ width: `${progressPct}%` }}
        />
      </div>
      <p className="text-right text-xs text-visa-gray-500 mt-1">{progressPct}% complete</p>
    </div>
  );
}
