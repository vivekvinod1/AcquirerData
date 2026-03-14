"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import AMMFPreview from "@/components/AMMFPreview";

export default function AMMFPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = use(params);
  const router = useRouter();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-visa-navy">AMMF Output</h2>
          <p className="text-sm text-visa-gray-500">Preview and download the generated AMMF file</p>
        </div>
        <button
          onClick={() => router.push(`/pipeline/${jobId}`)}
          className="px-4 py-2 text-sm bg-visa-gray-100 text-visa-gray-700 rounded-lg hover:bg-visa-gray-200"
        >
          Back to Dashboard
        </button>
      </div>
      <AMMFPreview jobId={jobId} />
    </div>
  );
}
