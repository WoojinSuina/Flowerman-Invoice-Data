import type { Prisma, ValidationStatus } from "@prisma/client";
import { parseMonthParam, parseWeekParam } from "@/lib/dates";
import { prisma } from "@/lib/db/client";
import { validateLineItem } from "@/lib/validation/engine";

export interface ReviewFilterParams {
  status?: string;
  store?: string;
  month?: string;
  week?: string;
}

export function buildReviewWhere(filters: ReviewFilterParams): Prisma.InvoiceWhereInput {
  const where: Prisma.InvoiceWhereInput = {};
  if (filters.status === "AUTO_APPROVED") {
    // Not a real ValidationStatus — a pseudo-filter for "approved by a bulk
    // tolerance action, never individually reviewed" (see autoApprovedReason
    // on Invoice), so these can always be found again later.
    where.validationStatus = "APPROVED";
    where.autoApprovedReason = { not: null };
  } else if (filters.status && filters.status !== "ALL") {
    where.validationStatus = filters.status as ValidationStatus;
  }
  if (filters.store) where.storeId = filters.store;

  if (filters.week) {
    const weekStart = parseWeekParam(filters.week);
    if (weekStart) {
      const weekEnd = new Date(weekStart);
      weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
      where.invoiceDate = { gte: weekStart, lt: weekEnd };
    }
  } else if (filters.month) {
    const monthStart = parseMonthParam(filters.month);
    const nextMonthStart = new Date(
      Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1)
    );
    where.invoiceDate = { gte: monthStart, lt: nextMonthStart };
  }

  return where;
}

/**
 * Invoices eligible for the "Approve all $0.00 difference" bulk action:
 * matches the current filters, reconciles exactly, isn't already approved,
 * and isn't flagged as a possible duplicate (that flag exists specifically
 * so a human checks it — bulk-approving would defeat it).
 */
export function buildZeroDiffApprovableWhere(filters: ReviewFilterParams): Prisma.InvoiceWhereInput {
  return {
    AND: [
      buildReviewWhere(filters),
      { validationDifferenceCents: 0 },
      { validationStatus: { not: "APPROVED" } },
      { possibleDuplicateOfId: null },
    ],
  };
}

type ApprovableCandidate = {
  id: string;
  items: { unitCostCents: number; deliveredQuantity: number; returnedQuantity: number }[];
};

/**
 * The DB-level where clauses below only check the invoice-level total. A
 * line item with returned > delivered ("impossible quantity") can still
 * net the invoice total to exactly $0.00 (or within a few dollars) by
 * coincidence — that's a real data problem, not a non-issue, so it must
 * still get a human look regardless of how small the top-line difference
 * is. Filters those out in JS since "impossible quantity" isn't a
 * persisted column, just something the validation engine computes from
 * delivered/returned/unitCost.
 */
function excludeImpossibleQuantities(candidates: ApprovableCandidate[]): string[] {
  return candidates
    .filter(
      (invoice) =>
        !invoice.items.some(
          (item) =>
            validateLineItem({ ...item, productName: "" }).hasImpossibleQuantity
        )
    )
    .map((invoice) => invoice.id);
}

export async function findZeroDiffApprovableInvoiceIds(
  filters: ReviewFilterParams
): Promise<string[]> {
  const candidates = await prisma.invoice.findMany({
    where: buildZeroDiffApprovableWhere(filters),
    select: {
      id: true,
      items: {
        select: { unitCostCents: true, deliveredQuantity: true, returnedQuantity: true },
      },
    },
  });

  return excludeImpossibleQuantities(candidates);
}

/**
 * Invoices eligible for a "Approve all under $X difference" bulk action —
 * same safety net as the $0.00 case (excludes possible duplicates and
 * already-approved invoices), but with a dollar tolerance instead of an
 * exact match. Unlike the $0.00 case, this is a judgment call, not a
 * mathematical certainty — every invoice it touches gets flagged via
 * autoApprovedReason so it can be found again later (see buildReviewWhere's
 * "AUTO_APPROVED" pseudo-filter).
 */
export function buildToleranceApprovableWhere(
  filters: ReviewFilterParams,
  maxDifferenceCents: number
): Prisma.InvoiceWhereInput {
  return {
    AND: [
      buildReviewWhere(filters),
      { validationDifferenceCents: { gt: -maxDifferenceCents, lt: maxDifferenceCents } },
      { validationStatus: { not: "APPROVED" } },
      { possibleDuplicateOfId: null },
    ],
  };
}

export async function findToleranceApprovableInvoiceIds(
  filters: ReviewFilterParams,
  maxDifferenceCents: number
): Promise<string[]> {
  const candidates = await prisma.invoice.findMany({
    where: buildToleranceApprovableWhere(filters, maxDifferenceCents),
    select: {
      id: true,
      items: {
        select: { unitCostCents: true, deliveredQuantity: true, returnedQuantity: true },
      },
    },
  });

  return excludeImpossibleQuantities(candidates);
}
