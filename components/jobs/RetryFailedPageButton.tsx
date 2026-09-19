"use client";

import { useState } from "react";
import { useUploadQueue } from "@/components/upload/UploadQueueProvider";

export function RetryFailedPageButton({ url, page }: { url: string; page: number | null }) {
  const { addFile } = useUploadQueue();
  const [status, setStatus] = useState<"idle" | "loading" | "queued" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleRetry() {
    setStatus("loading");
    setError(null);
    try {
      // The failed page's own file is already sitting in storage — fetch it
      // back and feed it straight into the same upload queue everything
      // else uses, instead of making the user find and re-select it by hand.
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Could not fetch the scanned file (${res.status})`);
      }
      const blob = await res.blob();
      const filename = url.split("/").pop() || `retry-page-${page ?? "x"}`;
      addFile(new File([blob], filename, { type: blob.type }));
      setStatus("queued");
    } catch (err) {
      setStatus("error");
      setError((err as Error).message);
    }
  }

  if (status === "queued") {
    return <span className="text-xs text-green-700">Added to the upload queue on Jobs</span>;
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleRetry}
        disabled={status === "loading"}
        className="text-xs text-blue-600 underline disabled:opacity-40"
      >
        {status === "loading" ? "Adding…" : "Retry this page"}
      </button>
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}
