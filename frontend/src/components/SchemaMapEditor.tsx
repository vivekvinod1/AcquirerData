"use client";
import { useState, useRef, useEffect } from "react";
import type { SchemaMapping, ColumnMapping, MappingCandidate } from "@/lib/types";

interface SchemaMapEditorProps {
  mapping: SchemaMapping;
  onUpdate?: (mapping: SchemaMapping) => void;
  editable?: boolean;
}

function getConfidenceBadge(c: number, hasAlts: boolean) {
  if (hasAlts) return { color: "bg-yellow-100 text-yellow-800", label: "Multiple" };
  if (c >= 0.9) return { color: "bg-green-100 text-green-800", label: "High" };
  if (c >= 0.7) return { color: "bg-amber-100 text-amber-800", label: "Medium" };
  return { color: "bg-red-100 text-red-800", label: "Low" };
}

/** Dropdown for selecting among candidate mappings */
function CandidateDropdown({
  current,
  alternatives,
  onSelect,
  onClose,
}: {
  current: { source_table: string | null; source_column: string | null; confidence: number; reasoning: string; is_derived: boolean; derivation_logic: string };
  alternatives: MappingCandidate[];
  onSelect: (candidate: MappingCandidate, index: number) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  const allCandidates = [
    { ...current, _isCurrent: true },
    ...alternatives.map((a) => ({ ...a, _isCurrent: false })),
  ];

  return (
    <div ref={ref} className="absolute z-50 mt-1 left-0 right-0 bg-white border border-visa-gray-300 rounded-lg shadow-lg max-h-64 overflow-y-auto">
      <div className="px-3 py-2 text-xs font-semibold text-visa-gray-500 bg-visa-gray-50 border-b">
        Select mapping — {allCandidates.length} candidate{allCandidates.length > 1 ? "s" : ""}
      </div>
      {allCandidates.map((c, idx) => (
        <button
          key={idx}
          onClick={() => {
            if (!c._isCurrent) onSelect(c as MappingCandidate, idx - 1);
            onClose();
          }}
          className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b border-visa-gray-100 last:border-b-0 transition ${
            c._isCurrent ? "bg-blue-50/50" : ""
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="font-medium text-visa-navy">
              {c.source_table ? `${c.source_table}.` : ""}
              {c.source_column || (c.is_derived ? "Derived" : "Unmapped")}
            </span>
            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
              c.confidence >= 0.9 ? "bg-green-100 text-green-700" :
              c.confidence >= 0.7 ? "bg-amber-100 text-amber-700" :
              "bg-red-100 text-red-700"
            }`}>
              {(c.confidence * 100).toFixed(0)}%
            </span>
            {c._isCurrent && (
              <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-xs font-medium">Current</span>
            )}
          </div>
          <p className="text-xs text-visa-gray-500 mt-0.5 line-clamp-2">
            {c.is_derived ? c.derivation_logic : c.reasoning}
          </p>
        </button>
      ))}
    </div>
  );
}

export default function SchemaMapEditor({
  mapping,
  onUpdate,
  editable = false,
}: SchemaMapEditorProps) {
  const [openDropdown, setOpenDropdown] = useState<number | null>(null);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editTable, setEditTable] = useState("");
  const [editColumn, setEditColumn] = useState("");

  const handleSelectAlternative = (rowIdx: number, candidate: MappingCandidate, _altIdx: number) => {
    if (!onUpdate) return;
    const newMappings = [...mapping.mappings];
    const current = newMappings[rowIdx];

    // Move current primary into alternatives, swap in the selected candidate
    const oldPrimary: MappingCandidate = {
      source_table: current.source_table,
      source_column: current.source_column,
      confidence: current.confidence,
      reasoning: current.reasoning,
      is_derived: current.is_derived,
      derivation_logic: current.derivation_logic,
    };

    const newAlternatives = [
      oldPrimary,
      ...current.alternatives.filter(
        (a) => !(a.source_table === candidate.source_table && a.source_column === candidate.source_column)
      ),
    ];

    newMappings[rowIdx] = {
      ...current,
      source_table: candidate.source_table,
      source_column: candidate.source_column,
      confidence: candidate.confidence,
      reasoning: candidate.reasoning,
      is_derived: candidate.is_derived,
      derivation_logic: candidate.derivation_logic,
      alternatives: newAlternatives,
    };

    // Recalculate unmapped
    const mapped = new Set(
      newMappings
        .filter((m) => m.source_column || m.is_derived)
        .map((m) => m.ammf_column)
    );
    const newUnmappedRequired = mapping.unmapped_required.filter((col) => !mapped.has(col));

    onUpdate({
      mappings: newMappings,
      unmapped_required: newUnmappedRequired,
      unmapped_optional: mapping.unmapped_optional,
    });
  };

  const handleEdit = (idx: number, m: ColumnMapping) => {
    setEditIdx(idx);
    setEditTable(m.source_table || "");
    setEditColumn(m.source_column || "");
  };

  const handleSaveEdit = (idx: number) => {
    if (!onUpdate) return;
    const newMappings = [...mapping.mappings];
    newMappings[idx] = {
      ...newMappings[idx],
      source_table: editTable || null,
      source_column: editColumn || null,
      confidence: editColumn ? 1.0 : 0,
      reasoning: editColumn ? "Manually set by user" : newMappings[idx].reasoning,
    };

    const mapped = new Set(
      newMappings
        .filter((m) => m.source_column || m.is_derived)
        .map((m) => m.ammf_column)
    );
    const allRequired = [
      ...mapping.unmapped_required,
      ...newMappings
        .filter(
          (m) =>
            !m.source_column &&
            !m.is_derived &&
            !mapping.unmapped_optional.includes(m.ammf_column)
        )
        .map((m) => m.ammf_column),
    ];
    const newUnmappedRequired = [...new Set(allRequired)].filter(
      (col) => !mapped.has(col)
    );

    onUpdate({
      mappings: newMappings,
      unmapped_required: newUnmappedRequired,
      unmapped_optional: mapping.unmapped_optional,
    });
    setEditIdx(null);
  };

  const handleCancelEdit = () => setEditIdx(null);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-visa-gray-200 overflow-hidden">
      <div className="p-4 bg-visa-navy text-white">
        <h3 className="font-semibold">Schema Mapping</h3>
        <p className="text-sm text-visa-gray-200 mt-1">
          {mapping.mappings.filter((m) => m.source_column || m.is_derived).length} of{" "}
          {mapping.mappings.length} columns mapped
          {editable && (
            <span className="ml-2 text-visa-gold text-xs">(click source to see alternatives, or pencil to edit manually)</span>
          )}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-visa-gray-50 border-b">
            <tr>
              <th className="text-left p-3 font-medium">AMMF Column</th>
              <th className="text-left p-3 font-medium">Source Mapping</th>
              <th className="text-left p-3 font-medium w-24">Confidence</th>
              <th className="text-left p-3 font-medium">Reasoning</th>
              {editable && <th className="text-center p-3 font-medium w-16">Edit</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-visa-gray-100">
            {mapping.mappings.map((m, i) => {
              const hasAlts = (m.alternatives?.length || 0) > 0;
              const badge = getConfidenceBadge(m.confidence, hasAlts);
              const isMapped = m.source_column || m.is_derived;

              return (
                <tr key={i} className="hover:bg-visa-gray-50">
                  <td className="p-3 font-medium text-visa-navy">{m.ammf_column}</td>

                  {editIdx === i ? (
                    <>
                      <td className="p-3" colSpan={2}>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={editTable}
                            onChange={(e) => setEditTable(e.target.value)}
                            className="flex-1 text-sm border border-visa-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-visa-navy"
                            placeholder="Table name"
                          />
                          <input
                            type="text"
                            value={editColumn}
                            onChange={(e) => setEditColumn(e.target.value)}
                            className="flex-1 text-sm border border-visa-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-visa-navy"
                            placeholder="Column name"
                          />
                        </div>
                      </td>
                      <td className="p-3">
                        <span className="text-xs text-visa-gray-400 italic">Editing...</span>
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex gap-1 justify-center">
                          <button
                            onClick={() => handleSaveEdit(i)}
                            className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 transition"
                          >
                            Save
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="px-2 py-1 bg-visa-gray-200 text-visa-gray-700 rounded text-xs hover:bg-visa-gray-300 transition"
                          >
                            ✕
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      {/* Source Mapping — clickable if alternatives exist */}
                      <td className="p-3 relative">
                        {editable && hasAlts ? (
                          <button
                            onClick={() => setOpenDropdown(openDropdown === i ? null : i)}
                            className="flex items-center gap-1.5 text-left hover:bg-blue-50 rounded px-2 py-1 -mx-2 -my-1 transition w-full"
                          >
                            <span className="text-visa-gray-700">
                              {isMapped ? (
                                <>
                                  {m.source_table && <span className="text-visa-gray-400">{m.source_table}.</span>}
                                  {m.source_column || (m.is_derived ? <span className="italic text-visa-gray-500">{m.derivation_logic || "Derived"}</span> : "—")}
                                </>
                              ) : (
                                <span className="text-visa-gray-400">—</span>
                              )}
                            </span>
                            <span className="ml-auto flex items-center gap-1 shrink-0">
                              <span className="text-xs text-blue-600 font-medium">
                                {m.alternatives.length} alt{m.alternatives.length > 1 ? "s" : ""}
                              </span>
                              <svg className={`w-3.5 h-3.5 text-blue-500 transition-transform ${openDropdown === i ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </span>
                          </button>
                        ) : (
                          <span className="text-visa-gray-700">
                            {isMapped ? (
                              <>
                                {m.source_table && <span className="text-visa-gray-400">{m.source_table}.</span>}
                                {m.source_column || (m.is_derived ? <span className="italic text-visa-gray-500">{m.derivation_logic || "Derived"}</span> : "—")}
                              </>
                            ) : (
                              <span className="text-visa-gray-400">—</span>
                            )}
                          </span>
                        )}
                        {openDropdown === i && (
                          <CandidateDropdown
                            current={{
                              source_table: m.source_table,
                              source_column: m.source_column,
                              confidence: m.confidence,
                              reasoning: m.reasoning,
                              is_derived: m.is_derived,
                              derivation_logic: m.derivation_logic,
                            }}
                            alternatives={m.alternatives}
                            onSelect={(candidate, altIdx) => handleSelectAlternative(i, candidate, altIdx)}
                            onClose={() => setOpenDropdown(null)}
                          />
                        )}
                      </td>

                      {/* Confidence */}
                      <td className="p-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${badge.color}`}>
                          {badge.label} ({(m.confidence * 100).toFixed(0)}%)
                        </span>
                      </td>

                      {/* Reasoning */}
                      <td className="p-3 text-visa-gray-500 text-xs max-w-xs truncate">
                        {m.reasoning}
                      </td>

                      {/* Edit button */}
                      {editable && (
                        <td className="p-3 text-center">
                          <button
                            onClick={() => handleEdit(i, m)}
                            className="p-1 text-visa-gray-400 hover:text-visa-navy transition"
                            title="Edit mapping manually"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                              />
                            </svg>
                          </button>
                        </td>
                      )}
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {mapping.unmapped_required.length > 0 && (
        <div className="p-4 bg-red-50 border-t border-red-200">
          <p className="text-sm text-visa-red font-medium">
            Missing Required Fields: {mapping.unmapped_required.join(", ")}
          </p>
        </div>
      )}
    </div>
  );
}
