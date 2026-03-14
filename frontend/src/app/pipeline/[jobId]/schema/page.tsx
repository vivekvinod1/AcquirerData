"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import SchemaMapEditor from "@/components/SchemaMapEditor";
import { getSchemaMapping } from "@/lib/api";
import type { SchemaMapping } from "@/lib/types";

export default function SchemaPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = use(params);
  const router = useRouter();
  const [mapping, setMapping] = useState<SchemaMapping | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSchemaMapping(jobId)
      .then((data) => setMapping(data))
      .finally(() => setLoading(false));
  }, [jobId]);

  if (loading) return <div className="text-center py-12 text-visa-gray-500">Loading schema mapping...</div>;
  if (!mapping) return <div className="text-center py-12 text-visa-gray-500">Schema mapping not yet available</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-visa-navy">Schema Mapping</h2>
          <p className="text-sm text-visa-gray-500">Review and adjust column mappings</p>
        </div>
        <button
          onClick={() => router.push(`/pipeline/${jobId}`)}
          className="px-4 py-2 text-sm bg-visa-gray-100 text-visa-gray-700 rounded-lg hover:bg-visa-gray-200"
        >
          Back to Dashboard
        </button>
      </div>
      <SchemaMapEditor mapping={mapping} />
    </div>
  );
}
