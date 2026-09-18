"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ProductOption {
  id: string;
  name: string;
}

export function MergeProductButton({
  productId,
  otherProducts,
}: {
  productId: string;
  otherProducts: ProductOption[];
}) {
  const router = useRouter();
  const [targetId, setTargetId] = useState("");
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleMerge() {
    if (!targetId) return;
    const target = otherProducts.find((p) => p.id === targetId);
    if (!target) return;
    if (!confirm(`Merge this product into "${target.name}"? This cannot be undone.`)) {
      return;
    }

    setMerging(true);
    setError(null);
    try {
      const res = await fetch("/api/products/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceProductId: productId, targetProductId: targetId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Merge failed (${res.status})`);
      }
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setMerging(false);
    }
  }

  return (
    <div className="flex items-center gap-1">
      <select
        value={targetId}
        onChange={(e) => setTargetId(e.target.value)}
        className="rounded border px-1 py-0.5 text-xs"
      >
        <option value="">Merge into…</option>
        {otherProducts.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <button
        onClick={handleMerge}
        disabled={!targetId || merging}
        className="rounded bg-gray-200 px-2 py-0.5 text-xs disabled:opacity-40"
      >
        {merging ? "…" : "Merge"}
      </button>
      {error && <span className="text-xs text-red-700">{error}</span>}
    </div>
  );
}
