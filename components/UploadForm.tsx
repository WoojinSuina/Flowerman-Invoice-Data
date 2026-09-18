"use client";

import { useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/review/StatusBadge";

interface UploadResultItem {
  sourcePage: number;
  invoice?: { id: string; invoiceNumber: string; validationStatus: string };
  error?: string;
}

interface UploadResponse {
  job: { id: string; filename: string; totalPages: number; status: string };
  results: UploadResultItem[];
  error?: string;
  detail?: string;
}

export function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResponse | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setUploading(true);
    setError(null);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/invoices/upload", { method: "POST", body: formData });
      const body = (await res.json()) as UploadResponse;
      if (!res.ok) {
        throw new Error(body.detail ?? body.error ?? `Upload failed (${res.status})`);
      }
      setResult(body);
      setFile(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className="mb-6 flex items-center gap-3">
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm"
        />
        <button
          type="submit"
          disabled={!file || uploading}
          className="rounded bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-40"
        >
          {uploading ? "Processing…" : "Upload"}
        </button>
      </form>

      {uploading && (
        <p className="mb-4 text-sm text-gray-500">
          Processing — for multi-page PDFs this can take a while (each page is
          extracted one at a time). Don&apos;t close this tab.
        </p>
      )}

      {error && (
        <div className="mb-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      {result && (
        <div>
          <p className="mb-3 text-sm">
            <Link href={`/jobs/${result.job.id}`} className="text-blue-600 underline">
              {result.job.filename}
            </Link>{" "}
            — <StatusBadge status={result.job.status} /> ({result.results.length} page
            {result.results.length === 1 ? "" : "s"})
          </p>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="py-2 pr-4">Page</th>
                <th className="py-2 pr-4">Result</th>
              </tr>
            </thead>
            <tbody>
              {result.results.map((r) => (
                <tr key={r.sourcePage} className="border-b">
                  <td className="py-2 pr-4">{r.sourcePage}</td>
                  <td className="py-2 pr-4">
                    {r.invoice ? (
                      <Link
                        href={`/review/${r.invoice.id}`}
                        className="text-blue-600 underline"
                      >
                        Invoice {r.invoice.invoiceNumber}
                      </Link>
                    ) : (
                      <span className="text-red-700">{r.error}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
