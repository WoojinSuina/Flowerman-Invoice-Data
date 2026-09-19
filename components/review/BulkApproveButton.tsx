"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function BulkApproveButton({
  eligibleCount,
  maxDifferenceDollars,
  label,
}: {
  eligibleCount: number;
  /** Omit for the exact-$0.00 action; pass a dollar amount for a tolerance-based approve. */
  maxDifferenceDollars?: number;
  label: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/invoices/bulk-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: searchParams.get("status") ?? undefined,
          store: searchParams.get("store") ?? undefined,
          month: searchParams.get("month") ?? undefined,
          week: searchParams.get("week") ?? undefined,
          maxDifferenceDollars,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Bulk approve failed (${res.status})`);
      }
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (eligibleCount === 0) return null;

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="rounded bg-green-700 px-3 py-1 text-sm text-white disabled:opacity-40"
      >
        {loading ? "Approving…" : label}
      </button>
      {error && <p className="mt-1 text-sm text-red-700">{error}</p>}
    </div>
  );
}
