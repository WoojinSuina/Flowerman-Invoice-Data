"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  validateInvoice,
  effectiveStatusForConsignment,
  type LineItemInput,
} from "@/lib/validation/engine";
import { centsToDollars, dollarsToCents, formatCents } from "@/lib/money";
import { isFutureDate } from "@/lib/dates";
import { StatusBadge } from "@/components/review/StatusBadge";
import { PdfPageImage } from "@/components/review/PdfPageImage";

interface ReviewItem {
  id: string;
  lineNumber: number;
  productName: string;
  unitCostCents: number;
  deliveredQuantity: number;
  returnedQuantity: number;
}

interface ReviewInvoice {
  id: string;
  invoiceNumber: string;
  storeName: string;
  sourceImageUrl: string | null;
  invoiceDate: string;
  validationStatus: string;
  totalChargesCents: number;
  totalCreditCents: number;
  totalAmountDueCents: number;
  items: ReviewItem[];
  duplicateOf?: { id: string; invoiceNumber: string; sourceImageUrl: string | null } | null;
  autoApprovedReason?: string | null;
  isConsignment: boolean;
}

function ScannedImage({ url, alt }: { url: string; alt: string }) {
  return url.endsWith(".pdf") ? (
    <PdfPageImage src={url} alt={alt} />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={alt} className="w-full rounded border object-contain" />
  );
}

// Both inputs below use local text state instead of formatting `value`
// straight from the numeric prop on every keystroke. Reformatting mid-edit
// (e.g. forcing "5" -> "5.00" via toFixed, or "" -> "0" via `Number(x) || 0`)
// is what made typing feel "funky" — the display would fight the user
// before they finished a decimal point or cleared a field to retype it.
// The raw text is freely editable; it only gets normalized on blur.

function MoneyInput({
  cents,
  onChange,
}: {
  cents: number;
  onChange: (cents: number) => void;
}) {
  const [text, setText] = useState(() => centsToDollars(cents).toFixed(2));

  return (
    <input
      type="text"
      inputMode="decimal"
      className="w-24 rounded border px-2 py-1 text-right"
      value={text}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        const parsed = Number(raw);
        if (raw.trim() !== "" && !Number.isNaN(parsed)) {
          onChange(dollarsToCents(parsed));
        }
      }}
      onBlur={() => setText(centsToDollars(cents).toFixed(2))}
    />
  );
}

function QuantityInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const [text, setText] = useState(() => String(value));

  return (
    <input
      type="text"
      inputMode="numeric"
      className="w-16 rounded border px-2 py-1 text-right"
      value={text}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        if (raw.trim() === "" || raw === "-") return;
        const parsed = Number(raw);
        if (!Number.isNaN(parsed) && Number.isInteger(parsed)) {
          onChange(parsed);
        }
      }}
      onBlur={() => setText(String(value))}
    />
  );
}

export function InvoiceReviewForm({ invoice }: { invoice: ReviewInvoice }) {
  const router = useRouter();
  const [baseline, setBaseline] = useState(invoice);
  const [expanded, setExpanded] = useState(false);

  const [totals, setTotals] = useState({
    totalChargesCents: invoice.totalChargesCents,
    totalCreditCents: invoice.totalCreditCents,
    totalAmountDueCents: invoice.totalAmountDueCents,
  });
  const [invoiceDate, setInvoiceDate] = useState(invoice.invoiceDate);
  const [items, setItems] = useState<ReviewItem[]>(invoice.items);
  const [status, setStatus] = useState(invoice.validationStatus);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const liveValidation = useMemo(() => {
    const engineItems: LineItemInput[] = items.map((item) => ({
      productName: item.productName,
      unitCostCents: item.unitCostCents,
      deliveredQuantity: item.deliveredQuantity,
      returnedQuantity: item.returnedQuantity,
    }));
    return validateInvoice({
      invoiceTotalChargesCents: totals.totalChargesCents,
      invoiceTotalCreditCents: totals.totalCreditCents,
      invoiceTotalAmountDueCents: totals.totalAmountDueCents,
      items: engineItems,
    });
  }, [totals, items]);

  // Mirrors the server-side override in processInvoicePage.ts /
  // corrections/route.ts — a consignment invoice's written total isn't
  // derived from this page's math, so the live preview shouldn't show
  // REVIEW over a gap that's expected by design.
  const liveStatus = effectiveStatusForConsignment(liveValidation, invoice.isConsignment);

  const changedFields = useMemo(() => {
    const changes: string[] = [];
    if (invoiceDate !== baseline.invoiceDate) changes.push("Invoice date");
    if (totals.totalChargesCents !== baseline.totalChargesCents) changes.push("Total charges");
    if (totals.totalCreditCents !== baseline.totalCreditCents) changes.push("Total credit");
    if (totals.totalAmountDueCents !== baseline.totalAmountDueCents)
      changes.push("Total amount due");
    for (const item of items) {
      const original = baseline.items.find((i) => i.id === item.id);
      if (!original) continue;
      if (item.productName !== original.productName) changes.push(`${original.productName}: name`);
      if (item.unitCostCents !== original.unitCostCents)
        changes.push(`${original.productName}: unit cost`);
      if (item.deliveredQuantity !== original.deliveredQuantity)
        changes.push(`${original.productName}: delivered qty`);
      if (item.returnedQuantity !== original.returnedQuantity)
        changes.push(`${original.productName}: returned qty`);
    }
    return changes;
  }, [invoiceDate, totals, items, baseline]);

  function updateItem(id: string, patch: Partial<ReviewItem>) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/corrections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceDate,
          invoiceTotalChargesCents: totals.totalChargesCents,
          invoiceTotalCreditCents: totals.totalCreditCents,
          invoiceTotalAmountDueCents: totals.totalAmountDueCents,
          items: items.map((item) => ({
            id: item.id,
            productName: item.productName,
            unitCostCents: item.unitCostCents,
            deliveredQuantity: item.deliveredQuantity,
            returnedQuantity: item.returnedQuantity,
          })),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Save failed (${res.status})`);
      }
      const data = await res.json();
      setStatus(data.invoice.validationStatus);
      setBaseline({
        ...invoice,
        invoiceDate,
        totalChargesCents: totals.totalChargesCents,
        totalCreditCents: totals.totalCreditCents,
        totalAmountDueCents: totals.totalAmountDueCents,
        items,
      });
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove() {
    setApproving(true);
    setError(null);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/approve`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Approve failed (${res.status})`);
      }
      router.push("/review");
    } catch (err) {
      setError((err as Error).message);
      setApproving(false);
    }
  }

  return (
    <div className={expanded ? "grid grid-cols-1 gap-6" : "grid grid-cols-1 gap-6 lg:grid-cols-2"}>
      <div
        className={
          expanded
            ? "h-[calc(100vh-3rem)]"
            : "lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)] lg:overflow-auto"
        }
      >
        {invoice.sourceImageUrl && (
          <div className="mb-2 flex items-center gap-4">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-sm text-blue-600 underline"
            >
              {expanded ? "Collapse" : "Expand"}
            </button>
            <a
              href={invoice.sourceImageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 underline"
            >
              Open full size
            </a>
          </div>
        )}
        <div className={invoice.duplicateOf ? "grid grid-cols-2 gap-3" : undefined}>
          <div>
            {invoice.duplicateOf && (
              <p className="mb-1 text-xs text-gray-500">This scan</p>
            )}
            {invoice.sourceImageUrl ? (
              <ScannedImage
                url={invoice.sourceImageUrl}
                alt={`Scanned invoice ${invoice.invoiceNumber}`}
              />
            ) : (
              <div className="flex h-64 items-center justify-center rounded border bg-gray-100 text-gray-500">
                No scanned image available
              </div>
            )}
          </div>
          {invoice.duplicateOf && (
            <div>
              <p className="mb-1 text-xs text-gray-500">
                Already on file:{" "}
                <Link href={`/review/${invoice.duplicateOf.id}`} className="underline">
                  #{invoice.duplicateOf.invoiceNumber}
                </Link>
              </p>
              {invoice.duplicateOf.sourceImageUrl ? (
                <ScannedImage
                  url={invoice.duplicateOf.sourceImageUrl}
                  alt={`Existing invoice ${invoice.duplicateOf.invoiceNumber}`}
                />
              ) : (
                <div className="flex h-64 items-center justify-center rounded border bg-gray-100 text-gray-500">
                  No scanned image available
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {!expanded && <div>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">
              Invoice {invoice.invoiceNumber} — {invoice.storeName}
            </h1>
            <p className="text-sm text-gray-500">
              Saved status: <StatusBadge status={status} /> · Live:{" "}
              <StatusBadge status={liveStatus} />
            </p>
          </div>
        </div>

        {invoice.duplicateOf && (
          <div className="mb-4 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Possible duplicate: invoice{" "}
            <Link href={`/review/${invoice.duplicateOf.id}`} className="underline">
              #{invoice.duplicateOf.invoiceNumber}
            </Link>{" "}
            at this store has the same date and matches on total amount due or
            line items — check whether this is a separate delivery or an
            accidental re-scan before approving.
          </div>
        )}

        {invoice.isConsignment && liveValidation.differenceCents !== 0 && (
          <div className="mb-4 rounded border border-purple-300 bg-purple-50 px-3 py-2 text-sm text-purple-900">
            Consignment store — the written total reflects a running balance
            from the prior delivery cycle, not this page&apos;s own math, so a
            difference here ({formatCents(liveValidation.differenceCents)}) is
            expected and doesn&apos;t need to be corrected.
          </div>
        )}

        {invoice.autoApprovedReason && (
          <div className="mb-4 rounded border border-blue-300 bg-blue-50 px-3 py-2 text-sm text-blue-900">
            This invoice was auto-approved by a bulk action, not individually
            reviewed: {invoice.autoApprovedReason}
          </div>
        )}

        {isFutureDate(new Date(invoiceDate)) && (
          <div className="mb-4 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            This invoice is dated {invoiceDate}, which is after today — a
            delivery can&apos;t happen in the future. Usually a month/day swap
            on a hard-to-read scan; check the image and correct the date
            below before approving.
          </div>
        )}

        {error && (
          <div className="mb-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="mb-4 grid grid-cols-4 gap-4 rounded border p-3 text-sm">
          <label className="flex flex-col gap-1">
            Invoice date
            <input
              type="date"
              className="rounded border px-2 py-1"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            Total charges
            <MoneyInput
              cents={totals.totalChargesCents}
              onChange={(v) => setTotals((t) => ({ ...t, totalChargesCents: v }))}
            />
          </label>
          <label className="flex flex-col gap-1">
            Total credit
            <MoneyInput
              cents={totals.totalCreditCents}
              onChange={(v) => setTotals((t) => ({ ...t, totalCreditCents: v }))}
            />
          </label>
          <label className="flex flex-col gap-1">
            Total amount due
            <MoneyInput
              cents={totals.totalAmountDueCents}
              onChange={(v) => setTotals((t) => ({ ...t, totalAmountDueCents: v }))}
            />
          </label>
        </div>

        <table className="mb-4 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="py-1 pr-2">Product</th>
              <th className="py-1 pr-2">Unit cost</th>
              <th className="py-1 pr-2">Delivered</th>
              <th className="py-1 pr-2">Returned</th>
              <th className="py-1 pr-2">Sold</th>
              <th className="py-1 pr-2">Total credit</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => {
              const result = liveValidation.items[index];
              return (
                <tr
                  key={item.id}
                  className={`border-b ${result?.hasImpossibleQuantity ? "bg-red-50" : ""}`}
                >
                  <td className="py-1 pr-2">
                    <input
                      className="w-32 rounded border px-2 py-1"
                      value={item.productName}
                      onChange={(e) => updateItem(item.id, { productName: e.target.value })}
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <MoneyInput
                      cents={item.unitCostCents}
                      onChange={(v) => updateItem(item.id, { unitCostCents: v })}
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <QuantityInput
                      value={item.deliveredQuantity}
                      onChange={(v) => updateItem(item.id, { deliveredQuantity: v })}
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <QuantityInput
                      value={item.returnedQuantity}
                      onChange={(v) => updateItem(item.id, { returnedQuantity: v })}
                    />
                  </td>
                  <td className="py-1 pr-2">{result?.soldQuantity}</td>
                  <td className="py-1 pr-2">{formatCents(result?.returnCreditCents ?? 0)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 font-medium">
              <td className="py-1 pr-2" colSpan={5}>
                Total (calculated)
              </td>
              <td className="py-1 pr-2">{formatCents(liveValidation.calculatedTotalCreditCents)}</td>
            </tr>
          </tfoot>
        </table>

        {!invoice.isConsignment && liveValidation.suggestions.length > 0 && (
          <ul className="mb-4 list-disc rounded border border-amber-300 bg-amber-50 p-3 pl-6 text-sm text-amber-900">
            {liveValidation.suggestions.map((s, i) => (
              <li key={i}>{s.message}</li>
            ))}
          </ul>
        )}

        {changedFields.length > 0 && (
          <div className="mb-4 rounded border bg-gray-50 p-3 text-sm">
            <p className="mb-1 font-medium">Unsaved changes:</p>
            <ul className="list-disc pl-5 text-gray-600">
              {changedFields.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mb-4 text-sm text-gray-600">
          Calculated amount due: {formatCents(liveValidation.calculatedAmountDueCents)} · Difference:{" "}
          {formatCents(liveValidation.differenceCents)}
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving || changedFields.length === 0}
            className="rounded bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-40"
          >
            {saving ? "Saving..." : "Save corrections"}
          </button>
          <button
            onClick={handleApprove}
            disabled={approving || status === "APPROVED"}
            className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-40"
          >
            {approving ? "Approving..." : status === "APPROVED" ? "Approved" : "Approve"}
          </button>
        </div>
      </div>}
    </div>
  );
}
