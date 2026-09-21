const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_WEEK_MS = 7 * ONE_DAY_MS;

export interface WeekOffsetCandidate {
  id: string;
  invoiceDate: Date;
}

export interface WeekOffsetCorrection {
  id: string;
  correctedDate: Date;
}

// Sunday of the calendar week containing `date` — a duplicate of
// lib/dates.ts's getWeekStart, kept local (no `@/` alias) so this stays
// testable under the plain node test runner used elsewhere in lib/.
function weekStart(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.getTime();
}

/**
 * A delivery route runs across several real days, so a batch's invoices
 * legitimately spread across multiple dates within the same calendar
 * week — but occasionally a store's invoice gets written on a leftover
 * form from the PRIOR week's pad, landing it a whole week early even
 * though the delivery happened on schedule. Detect this by comparing
 * each invoice's calendar week against the batch's most common week (the
 * majority of any given batch is dated correctly): anything landing in
 * exactly the week before gets nudged forward by 7 days, which corrects
 * the week while preserving the actual day it was written on.
 */
export function findWeekOffsetInvoices(invoices: WeekOffsetCandidate[]): WeekOffsetCorrection[] {
  if (invoices.length === 0) return [];

  const counts = new Map<number, number>();
  for (const inv of invoices) {
    const week = weekStart(inv.invoiceDate);
    counts.set(week, (counts.get(week) ?? 0) + 1);
  }

  let modeWeek = weekStart(invoices[0].invoiceDate);
  let modeCount = 0;
  for (const [week, count] of counts) {
    if (count > modeCount || (count === modeCount && week > modeWeek)) {
      modeWeek = week;
      modeCount = count;
    }
  }

  const corrections: WeekOffsetCorrection[] = [];
  for (const inv of invoices) {
    if (modeWeek - weekStart(inv.invoiceDate) === ONE_WEEK_MS) {
      corrections.push({ id: inv.id, correctedDate: new Date(inv.invoiceDate.getTime() + ONE_WEEK_MS) });
    }
  }
  return corrections;
}
