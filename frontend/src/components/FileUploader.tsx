"use client";
import { useState, useCallback } from "react";
import { uploadFiles } from "@/lib/api";
import type { FileInfo } from "@/lib/types";

interface FileUploaderProps {
  onJobCreated: (jobId: string, files: FileInfo[]) => void;
}

export default function FileUploader({ onJobCreated }: FileUploaderProps) {
  const [dragOver, setDragOver] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<FileInfo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(
      (f) => f.name.endsWith(".xlsx") || f.name.endsWith(".xls") || f.name.endsWith(".csv")
    );
    setSelectedFiles((prev) => [...prev, ...files]);
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const result = await uploadFiles(selectedFiles);
      setUploadedFiles(result.files);
      onJobCreated(result.job_id, result.files);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-6">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          dragOver ? "border-visa-gold bg-visa-light-gold" : "border-visa-gray-300 hover:border-visa-navy"
        }`}
      >
        {/* Clickable drop target area */}
        <div
          className="cursor-pointer"
          onClick={() => document.getElementById("file-input")?.click()}
        >
          <input
            id="file-input"
            type="file"
            multiple
            accept=".xlsx,.xls,.csv"
            onChange={handleFileInput}
            className="hidden"
          />
          <svg className="mx-auto h-12 w-12 text-visa-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p className="mt-4 text-lg font-medium text-visa-gray-700">
            Drop acquirer data files here
          </p>
          <p className="mt-1 text-sm text-visa-gray-500">
            Supports .xlsx, .xls, .csv files
          </p>
        </div>

        {/* Selected files — inside drop zone */}
        {selectedFiles.length > 0 && !uploadedFiles.length && (
          <div className="mt-5 pt-5 border-t border-visa-gray-200 text-left">
            <h3 className="font-semibold text-visa-navy mb-3 text-sm">Selected Files</h3>
            <ul className="space-y-2">
              {selectedFiles.map((file, i) => (
                <li key={i} className="flex items-center justify-between p-2 bg-visa-gray-50 rounded">
                  <span className="text-sm text-visa-gray-700">
                    <svg className="inline w-4 h-4 mr-1.5 text-visa-navy" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                    className="text-visa-red text-sm hover:underline"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <button
              onClick={(e) => { e.stopPropagation(); handleUpload(); }}
              disabled={uploading}
              className="mt-4 w-full py-3 bg-visa-navy text-white font-semibold rounded-lg hover:bg-visa-blue disabled:opacity-50 transition-colors"
            >
              {uploading ? "Uploading..." : "Upload & Analyze"}
            </button>
          </div>
        )}

        {/* Uploaded files summary — inside drop zone */}
        {uploadedFiles.length > 0 && (
          <div className="mt-5 pt-5 border-t border-visa-gray-200 text-left">
            <h3 className="font-semibold text-green-700 mb-3 text-sm flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Files Uploaded Successfully
            </h3>
            {uploadedFiles.map((file, i) => (
              <div key={i} className="mb-3">
                <p className="font-medium text-sm text-visa-navy">{file.name}</p>
                <table className="mt-1 w-full text-sm">
                  <thead>
                    <tr className="text-visa-gray-500 text-left">
                      <th className="pr-4">Sheet</th>
                      <th className="pr-4">Rows</th>
                      <th>Columns</th>
                    </tr>
                  </thead>
                  <tbody>
                    {file.sheets.map((sheet) => (
                      <tr key={sheet}>
                        <td className="pr-4">{sheet}</td>
                        <td className="pr-4">{file.row_counts[sheet]?.toLocaleString()}</td>
                        <td>{file.column_counts[sheet]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-visa-red text-visa-red p-3 rounded-lg text-sm">{error}</div>
      )}
    </div>
  );
}
