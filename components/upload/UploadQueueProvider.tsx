"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

interface UploadResultItem {
  sourcePage: number;
  invoice?: { id: string; invoiceNumber: string; validationStatus: string };
  error?: string;
}

export interface UploadResponse {
  job: { id: string; filename: string; totalPages: number; status: string };
  results: UploadResultItem[];
  error?: string;
  detail?: string;
}

export type QueueStatus = "queued" | "uploading" | "done" | "error";

export interface QueueItem {
  id: string;
  file: File;
  status: QueueStatus;
  response?: UploadResponse;
  error?: string;
}

interface UploadQueueContextValue {
  queue: QueueItem[];
  processing: boolean;
  addFiles: (fileList: FileList | null) => void;
  removeItem: (id: string) => void;
  processQueue: () => Promise<void>;
}

const UploadQueueContext = createContext<UploadQueueContextValue | null>(null);

let nextId = 0;

/**
 * Lives in the root layout (not the /upload page) specifically so the queue
 * and its in-flight processing loop survive client-side navigation to other
 * pages — a page component's own state resets on unmount, which is exactly
 * what made the queue appear to "disappear" when switching to another tab.
 */
export function UploadQueueProvider({ children }: { children: ReactNode }) {
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
      setQueue((q) => q.map((i) => (i.id === item.id ? { ...i, status: "uploading" } : i)));
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

  return (
    <UploadQueueContext.Provider value={{ queue, processing, addFiles, removeItem, processQueue }}>
      {children}
    </UploadQueueContext.Provider>
  );
}

export function useUploadQueue(): UploadQueueContextValue {
  const ctx = useContext(UploadQueueContext);
  if (!ctx) {
    throw new Error("useUploadQueue must be used within an UploadQueueProvider");
  }
  return ctx;
}
