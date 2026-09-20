import type { Prisma } from "@prisma/client";

export interface DuplicateCandidateItem {
  productName: string;
  deliveredQuantity: number;
  returnedQuantity: number;
  unitCostCents: number;
}

function lineItemKey(item: DuplicateCandidateItem): string {
  return `${item.productName}|${item.deliveredQuantity}|${item.returnedQuantity}|${item.unitCostCents}`;
}

export function rawExtractionInvoiceNumber(rawExtraction: Prisma.JsonValue): string | undefined {
  if (rawExtraction && typeof rawExtraction === "object" && !Array.isArray(rawExtraction)) {
    const value = (rawExtraction as Record<string, unknown>).invoiceNumber;
    if (typeof value === "string") return value;
  }
  return undefined;
}

/**
 * Same store + same date isn't enough on its own to call two invoices a
 * duplicate (a store can get two real deliveries on the same day) — but
 * matching on the total, on the exact same set of line items (product,
 * delivered, returned, unit cost), or on what the AI originally read as
 * the invoice number is a strong enough signal either way. Checking items
 * too (not just the dollar total) catches a re-scan where OCR misread the
 * total differently between the two reads but got the same
 * products/quantities both times.
 *
 * The raw-invoice-number check specifically exists because a human
 * correction can otherwise hide a real duplicate: if the first scan's
 * invoice number (or totals/items) was corrected during review, a genuine
 * re-scan of that same physical invoice re-extracts the ORIGINAL
 * (uncorrected) reading again, which then matches neither the corrected
 * invoiceNumber+storeId unique constraint nor the current totals/items —
 * confirmed live when three already-reviewed invoices were silently
 * re-accepted as new after their originals had been corrected.
 * `Invoice.rawExtraction` is never overwritten by a correction (see its
 * own doc comment), so it's the one stable thing to compare a fresh
 * extraction against.
 */
export function isLikelyDuplicate(
  candidate: {
    totalAmountDueCents: number;
    items: DuplicateCandidateItem[];
    rawExtraction: Prisma.JsonValue;
  },
  extractedTotalAmountDueCents: number,
  extractedItems: DuplicateCandidateItem[],
  extractedInvoiceNumber: string
): boolean {
  if (candidate.totalAmountDueCents === extractedTotalAmountDueCents) return true;
  if (rawExtractionInvoiceNumber(candidate.rawExtraction) === extractedInvoiceNumber) return true;
  if (candidate.items.length !== extractedItems.length) return false;
  const candidateKeys = new Set(candidate.items.map(lineItemKey));
  return extractedItems.every((item) => candidateKeys.has(lineItemKey(item)));
}
