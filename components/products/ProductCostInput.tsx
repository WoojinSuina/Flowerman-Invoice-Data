"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * The wholesale/production cost per unit isn't in any invoice data — it
 * has to be entered by hand, once per product, so revenue can be turned
 * into actual profit. Saves on blur, same pattern as the review form's
 * money inputs (free-typed text, normalized only once editing is done).
 */
export function ProductCostInput({
  productId,
  costCents,
}: {
  productId: string;
  costCents: number | null;
}) {
  const router = useRouter();
  const [text, setText] = useState(costCents === null ? "" : (costCents / 100).toFixed(2));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const trimmed = text.trim();
    const dollars = trimmed === "" ? null : Number(trimmed);
    if (dollars !== null && (Number.isNaN(dollars) || dollars < 0)) {
      setError("Invalid");
      setText(costCents === null ? "" : (costCents / 100).toFixed(2));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/products/${productId}/cost`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dollars }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Save failed (${res.status})`);
      }
      setText(dollars === null ? "" : dollars.toFixed(2));
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-1">
      <span className="text-gray-500">$</span>
      <input
        type="text"
        inputMode="decimal"
        placeholder="—"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
        disabled={saving}
        className="w-16 rounded border px-1 py-0.5 text-right disabled:opacity-40"
      />
      {error && <span className="text-xs text-red-700">{error}</span>}
    </div>
  );
}
