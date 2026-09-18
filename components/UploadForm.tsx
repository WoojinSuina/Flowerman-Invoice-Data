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

type QueueStatus = "queued" | "uploading" | "done" | "error";

interface QueueItem {
  id: string;
  file: File;
  status: QueueStatus;
  response?: UploadResponse;
  error?: string;
}

let nextId = 0;

export function UploadForm() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [processing, setProcessing] = useState(false);

  function addFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const items: QueueItem[] = Array.from(fileList).map((file) => ({
      id: `f${nextId++}`,
      file,
      status: "queued",
    }));
    setQueue((q) => [...q, ...items]);
  }

  function removeItem(id: string) {
    setQueue((q) => q.filter((item) => item.id !== id));
  }

  async function processQueue() {
    setProcessing(true);
    const toProcess = queue.filter((item) => item.status === "queued");
    for (const item of toProcess) {
      setQueue((q) =>
        q.map((i) => (i.id === item.id ? { ...i, status: "uploading" } : i))
      );
      try {
        const formData = new FormData();
        formData.append("file", item.file);
        const res = await fetch("/api/invoices/upload", { method: "POST", body: formData });
        const body = (await res.json()) as UploadResponse;
        if (!res.ok) {
          throw new Error(body.detail ?? body.error ?? `Upload failed (${res.status})`);
        }
        setQueue((q) =>
          q.map((i) => (i.id === item.id ? { ...i, status: "done", response: body } : i))
        );
      } catch (err) {
        setQueue((q) =>
          q.map((i) =>
            i.id === item.id ? { ...i, status: "error", error: (err as Error).message } : i
          )
        );
      }
    }
    setProcessing(false);
  }

  const queuedCount = queue.filter((i) => i.status === "queued").length;
  const doneCount = queue.filter((i) => i.status === "done").length;
  const errorCount = queue.filter((i) => i.status === "error").length;

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <input
          type="file"
          multiple
          disabled={processing}
          accept="image/png,image/jpeg,image/webp,application/pdf"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
          className="text-sm"
        />
        <button
          type="button"
          onClick={processQueue}
          disabled={processing || queuedCount === 0}
          className="rounded bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-40"
        >
          {processing ? "Processing…" : queuedCount > 0 ? `Upload (${queuedCount})` : "Upload"}
        </button>
      </div>

      {queue.length > 0 && (
        <p className="mb-4 text-sm text-gray-500">
          {doneCount} of {queue.length} done
          {errorCount > 0 ? `, ${errorCount} failed` : ""} — files process one at a
          time (multi-page PDFs also extract one page at a time). Don&apos;t close
          this tab while processing.
        </p>
      )}

      {queue.length > 0 && (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="py-2 pr-4">File</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Result</th>
            </tr>
          </thead>
          <tbody>
            {queue.map((item) => {
              const pageErrors = item.response?.results.filter((r) => r.error).length ?? 0;
              return (
                <tr key={item.id} className="border-b align-top">
                  <td className="py-2 pr-4">{item.file.name}</td>
                  <td className="py-2 pr-4">
                    {item.status === "queued" && (
                      <>
                        <span className="text-gray-500">Queued</span>
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          className="ml-2 text-xs text-gray-400 underline"
                        >
                          remove
                        </button>
                      </>
                    )}
                    {item.status === "uploading" && (
                      <span className="text-blue-600">Processing…</span>
                    )}
                    {item.status === "done" && <StatusBadge status={item.response!.job.status} />}
                    {item.status === "error" && <span className="text-red-700">Failed</span>}
                  </td>
                  <td className="py-2 pr-4">
                    {item.status === "done" && item.response && (
                      <div>
                        <Link
                          href={`/jobs/${item.response.job.id}`}
                          className="text-blue-600 underline"
                        >
                          {item.response.results.length} page
                          {item.response.results.length === 1 ? "" : "s"}
                        </Link>
                        {pageErrors > 0 && (
                          <span className="ml-2 text-red-700">
                            ({pageErrors} page error{pageErrors === 1 ? "" : "s"})
                          </span>
                        )}
                      </div>
                    )}
                    {item.status === "error" && (
                      <span className="text-red-700">{item.error}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
