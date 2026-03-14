"use client";
import type { SchemaMapping, ColumnMapping } from "@/lib/types";

interface SchemaMapEditorProps {
  mapping: SchemaMapping;
  onUpdate?: (mapping: SchemaMapping) => void;
}

export default function SchemaMapEditor({ mapping, onUpdate }: SchemaMapEditorProps) {
  const getConfidenceColor = (c: number) => {
    if (c >= 0.9) return "bg-green-100 text-green-800";
    if (c >= 0.7) return "bg-yellow-100 text-yellow-800";
    return "bg-red-100 text-red-800";
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-visa-gray-200 overflow-hidden">
      <div className="p-4 bg-visa-navy text-white">
        <h3 className="font-semibold">Schema Mapping</h3>
        <p className="text-sm text-visa-gray-200 mt-1">
          {mapping.mappings.filter((m) => m.source_column || m.is_derived).length} of {mapping.mappings.length} columns mapped
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
            </tr>
          </thead>
          <tbody className="divide-y divide-visa-gray-100">
            {mapping.mappings.map((m, i) => (
              <tr key={i} className="hover:bg-visa-gray-50">
                <td className="p-3 font-medium text-visa-navy">{m.ammf_column}</td>
                <td className="p-3 text-visa-gray-700">{m.source_table || (m.is_derived ? "Derived" : "-")}</td>
                <td className="p-3 text-visa-gray-700">{m.source_column || (m.is_derived ? m.derivation_logic : "-")}</td>
                <td className="p-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getConfidenceColor(m.confidence)}`}>
                    {(m.confidence * 100).toFixed(0)}%
                  </span>
                </td>
                <td className="p-3 text-visa-gray-500 text-xs max-w-xs truncate">{m.reasoning}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {mapping.unmapped_required.length > 0 && (
        <div className="p-4 bg-red-50 border-t border-red-200">
          <p className="text-sm text-visa-red font-medium">Missing Required Fields: {mapping.unmapped_required.join(", ")}</p>
        </div>
      )}
    </div>
  );
}
