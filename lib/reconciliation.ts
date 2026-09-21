// Quantifies the financial impact of trusting an invoice's written total
// over what the line items actually add up to — the flip side of the
// validation engine's job. "AI proposes, math verifies, humans resolve
// exceptions" (§21) covers catching a mismatch; this covers what it costs
// when a human resolves it by approving the written number anyway.
import { prisma } from "@/lib/db/client";
import { CURRENCY_TOLERANCE_CENTS } from "@/lib/money";

// A written-vs-calculated gap below this is a plausible manual addition
// mistake — the kind of thing this report is meant to quantify. At or
// above it, the gap is almost certainly a transcription/OCR misread (e.g.
// a stray extra digit) rather than an employee's arithmetic slip, and
// belongs back on someone's desk to re-check the scan, not folded into an
// "error cost" total. Chosen after two ~$970-980 outliers turned out to be
// digit-insertion misreads, an order of magnitude past every genuine
// small error in the data.
export const LIKELY_MISREAD_THRESHOLD_CENTS = 5000; // $50

export type MismatchClassification = "plausible" | "likely_misread";

export interface MismatchedInvoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: Date;
  validationStatus: string;
  storeId: string;
  storeName: string;
  storeAddress: string | null;
  writtenCents: number;
  calculatedCents: number;
  // written - calculated: positive = gain (the store is being charged
  // more than the line items justify, which is more revenue for us),
  // negative = loss (charged less than the math says they owe).
  impactCents: number;
  classification: MismatchClassification;
}

/**
 * Every invoice where the written total and the line-item math disagree
 * by more than rounding. Pass `invoiceDateRange` to scope this to one
 * month (e.g. the Dashboard's "Write-in error impact" tile, which should
 * track whichever month is currently selected there) — omitted, this is
 * all-time (e.g. the Reconciliation page, which audits the whole history).
 */
export async function getMismatchedInvoices(invoiceDateRange?: {
  gte: Date;
  lt: Date;
}): Promise<MismatchedInvoice[]> {
  const invoices = await prisma.invoice.findMany({
    where: {
      OR: [
        { validationDifferenceCents: { gt: CURRENCY_TOLERANCE_CENTS } },
        { validationDifferenceCents: { lt: -CURRENCY_TOLERANCE_CENTS } },
      ],
      ...(invoiceDateRange ? { invoiceDate: invoiceDateRange } : {}),
    },
    select: {
      id: true,
      invoiceNumber: true,
      invoiceDate: true,
      validationStatus: true,
      validationDifferenceCents: true,
      totalAmountDueCents: true,
      calculatedAmountDueCents: true,
      storeId: true,
      store: { select: { name: true, address: true } },
    },
  });

  return invoices.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    invoiceDate: inv.invoiceDate,
    validationStatus: inv.validationStatus,
    storeId: inv.storeId,
    storeName: inv.store.name,
    storeAddress: inv.store.address,
    writtenCents: inv.totalAmountDueCents,
    calculatedCents: inv.calculatedAmountDueCents,
    impactCents: inv.validationDifferenceCents,
    classification:
      Math.abs(inv.validationDifferenceCents) >= LIKELY_MISREAD_THRESHOLD_CENTS
        ? "likely_misread"
        : "plausible",
  }));
}

export interface ReconciliationSummary {
  totalCount: number;
  approvedCount: number;
  approvedNetCents: number;
  reviewCount: number;
  reviewNetCents: number;
  likelyMisreadCount: number;
  likelyMisreadInReviewCount: number;
}

export function summarizeMismatches(invoices: MismatchedInvoice[]): ReconciliationSummary {
  const approved = invoices.filter((i) => i.validationStatus === "APPROVED");
  const review = invoices.filter((i) => i.validationStatus === "REVIEW");
  const sum = (list: MismatchedInvoice[]) => list.reduce((s, i) => s + i.impactCents, 0);

  return {
    totalCount: invoices.length,
    approvedCount: approved.length,
    approvedNetCents: sum(approved),
    reviewCount: review.length,
    reviewNetCents: sum(review),
    likelyMisreadCount: invoices.filter((i) => i.classification === "likely_misread").length,
    likelyMisreadInReviewCount: review.filter((i) => i.classification === "likely_misread").length,
  };
}

export interface StoreLossRow {
  storeId: string;
  name: string;
  address: string | null;
  count: number;
  netCents: number;
}

/** Worst stores first (most negative net = biggest loss). */
export function topStoresByNet(invoices: MismatchedInvoice[], take = 10): StoreLossRow[] {
  const byStore = new Map<string, StoreLossRow>();
  for (const inv of invoices) {
    const entry = byStore.get(inv.storeId) ?? {
      storeId: inv.storeId,
      name: inv.storeName,
      address: inv.storeAddress,
      count: 0,
      netCents: 0,
    };
    entry.count += 1;
    entry.netCents += inv.impactCents;
    byStore.set(inv.storeId, entry);
  }
  return [...byStore.values()].sort((a, b) => a.netCents - b.netCents).slice(0, take);
}
