"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import FileUploader from "@/components/FileUploader";
import type { FileInfo } from "@/lib/types";

export default function Home() {
  const router = useRouter();
  const [jobId, setJobId] = useState<string | null>(null);

  const handleJobCreated = (id: string, files: FileInfo[]) => {
    setJobId(id);
    router.push(`/pipeline/${id}`);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-visa-navy">Upload Acquirer Data</h2>
        <p className="mt-2 text-visa-gray-500">
          Upload raw data files from the acquirer. The system will analyze schemas,
          map columns to AMMF format, run quality checks, and validate against compliance rules.
        </p>
      </div>

      <FileUploader onJobCreated={handleJobCreated} />

      <div className="mt-12 grid grid-cols-3 gap-6 text-center">
        <div className="p-4 bg-white rounded-lg shadow-sm border border-visa-gray-200">
          <div className="text-2xl font-bold text-visa-navy">6</div>
          <div className="text-sm text-visa-gray-500 mt-1">AI Agents</div>
        </div>
        <div className="p-4 bg-white rounded-lg shadow-sm border border-visa-gray-200">
          <div className="text-2xl font-bold text-visa-navy">31</div>
          <div className="text-sm text-visa-gray-500 mt-1">AMMF Columns</div>
        </div>
        <div className="p-4 bg-white rounded-lg shadow-sm border border-visa-gray-200">
          <div className="text-2xl font-bold text-visa-navy">13</div>
          <div className="text-sm text-visa-gray-500 mt-1">Violation Rules</div>
        </div>
      </div>
    </div>
  );
}
