"use client";

import type { ViolationRuleInfo } from "@/lib/types";
import { DEFAULT_UNCHECKED_VIOLATIONS } from "@/lib/constants";

interface Props {
  rules: ViolationRuleInfo[];
  selected: Set<string>;
  onToggle: (ruleId: string) => void;
  onSelectAll: () => void;
  onSelectDefaults: () => void;
}

export default function ViolationRuleSelector({
  rules,
  selected,
  onToggle,
  onSelectAll,
  onSelectDefaults,
}: Props) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-visa-navy">
          Violation Rules to Execute
        </h3>
        <div className="flex gap-2">
          <button
            onClick={onSelectDefaults}
            className="px-3 py-1 text-xs font-medium rounded-full bg-visa-gold text-visa-navy hover:bg-visa-gold/80 transition"
          >
            Defaults
          </button>
          <button
            onClick={onSelectAll}
            className="px-3 py-1 text-xs font-medium rounded-full bg-visa-gray-100 text-visa-gray-700 hover:bg-visa-gray-200 transition"
          >
            Select All
          </button>
        </div>
      </div>

      <p className="text-xs text-visa-gray-500">
        {selected.size} of {rules.length} rules selected
        {DEFAULT_UNCHECKED_VIOLATIONS.size > 0 && (
          <span className="ml-1">
            (V5, V11, V12 unchecked by default)
          </span>
        )}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {rules.map((rule) => {
          const isChecked = selected.has(rule.id);
          return (
            <label
              key={rule.id}
              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${
                isChecked
                  ? "border-visa-navy bg-blue-50/50"
                  : "border-visa-gray-200 bg-white hover:bg-visa-gray-50"
              }`}
            >
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => onToggle(rule.id)}
                className="mt-0.5 h-4 w-4 rounded border-visa-gray-300 text-visa-navy focus:ring-visa-navy"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-1.5 py-0.5 text-xs font-bold rounded ${
                      isChecked
                        ? "bg-visa-navy text-white"
                        : "bg-visa-gray-200 text-visa-gray-500"
                    }`}
                  >
                    {rule.id}
                  </span>
                  <span className="text-sm font-medium text-visa-gray-800 truncate">
                    {rule.name}
                  </span>
                </div>
                <p className="text-xs text-visa-gray-500 mt-0.5 line-clamp-2">
                  {rule.description}
                </p>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}
