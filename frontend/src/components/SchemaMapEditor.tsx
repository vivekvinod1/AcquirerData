"use client";
import { useState } from "react";
import type { SchemaMapping, ColumnMapping } from "@/lib/types";

interface SchemaMapEditorProps {
  mapping: SchemaMapping;
  onUpdate?: (mapping: SchemaMapping) => void;
  editable?: boolean;
}

export default function SchemaMapEditor({
  mapping,
  onUpdate,
  editable = false,
}: SchemaMapEditorProps) {
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editTable, setEditTable] = useState("");
  const [editColumn, setEditColumn] = useState("");

  const getConfidenceColor = (c: number) => {
    if (c >= 0.9) return "bg-green-100 text-green-800";
    if (c >= 0.7) return "bg-yellow-100 text-yellow-800";
    return "bg-red-100 text-red-800";
  };

  const handleEdit = (idx: number, m: ColumnMapping) => {
    setEditIdx(idx);
    setEditTable(m.source_table || "");
    setEditColumn(m.source_column || "");
  };

  const handleSaveEdit = (idx: number) => {
    if (!onUpdate) return;
    const updated = { ...mapping };
    const newMappings = [...updated.mappings];
    newMappings[idx] = {
      ...newMappings[idx],
      source_table: editTable || null,
      source_column: editColumn || null,
      confidence: editColumn ? 1.0 : 0,
      reasoning: editColumn ? "Manually set by user" : newMappings[idx].reasoning,
    };

    // Recalculate unmapped required
    const mapped = new Set(
      newMappings
        .filter((m) => m.source_column || m.is_derived)
        .map((m) => m.ammf_column)
    );

    // Keep original unmapped lists logic — required columns not mapped
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

  const handleCancelEdit = () => {
    setEditIdx(null);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-visa-gray-200 overflow-hidden">
      <div className="p-4 bg-visa-navy text-white">
        <h3 className="font-semibold">Schema Mapping</h3>
        <p className="text-sm text-visa-gray-200 mt-1">
          {mapping.mappings.filter((m) => m.source_column || m.is_derived).length} of{" "}
          {mapping.mappings.length} columns mapped
          {editable && (
            <span className="ml-2 text-visa-gold text-xs">(click pencil to edit)</span>
          )}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-visa-gray-50 border-b">
            <tr>
              <th className="text-left p-3 font-medium">AMMF Column</th>
              <th className="text-left p-3 font-medium">Source Table</th>
              <th className="text-left p-3 font-medium">Source Column</th>
              <th className="text-left p-3 font-medium">Confidence</th>
              <th className="text-left p-3 font-medium">Notes</th>
              {editable && <th className="text-center p-3 font-medium w-20">Edit</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-visa-gray-100">
            {mapping.mappings.map((m, i) => (
              <tr key={i} className="hover:bg-visa-gray-50">
                <td className="p-3 font-medium text-visa-navy">{m.ammf_column}</td>

                {editIdx === i ? (
                  <>
                    <td className="p-3">
                      <input
                        type="text"
                        value={editTable}
                        onChange={(e) => setEditTable(e.target.value)}
                        className="w-full text-sm border border-visa-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-visa-navy"
                        placeholder="Table name"
                      />
                    </td>
                    <td className="p-3">
                      <input
                        type="text"
                        value={editColumn}
                        onChange={(e) => setEditColumn(e.target.value)}
                        className="w-full text-sm border border-visa-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-visa-navy"
                        placeholder="Column name"
                      />
                    </td>
                    <td className="p-3">—</td>
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
                          Cancel
                        </button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="p-3 text-visa-gray-700">
                      {m.source_table || (m.is_derived ? "Derived" : "-")}
                    </td>
                    <td className="p-3 text-visa-gray-700">
                      {m.source_column || (m.is_derived ? m.derivation_logic : "-")}
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${getConfidenceColor(m.confidence)}`}
                      >
                        {(m.confidence * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td className="p-3 text-visa-gray-500 text-xs max-w-xs truncate">
                      {m.reasoning}
                    </td>
                    {editable && (
                      <td className="p-3 text-center">
                        <button
                          onClick={() => handleEdit(i, m)}
                          className="p-1 text-visa-gray-400 hover:text-visa-navy transition"
                          title="Edit mapping"
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
            ))}
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
