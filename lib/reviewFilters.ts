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
  if (filters.status && filters.status !== "ALL") {
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

/**
 * The DB-level where clause above only checks the invoice-level total. A
 * line item with returned > delivered ("impossible quantity") can still
 * net the invoice total to exactly $0.00 by coincidence — that's a real
 * data problem, not a non-issue, so it must still get a human look even
 * though the top-line difference is zero. Filters those out in JS since
 * "impossible quantity" isn't a persisted column, just something the
 * validation engine computes from delivered/returned/unitCost.
 */
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
