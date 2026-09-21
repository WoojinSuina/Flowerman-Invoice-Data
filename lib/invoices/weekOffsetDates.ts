const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export interface WeekOffsetCandidate {
  id: string;
  invoiceDate: Date;
  isConsignment: boolean;
}

export interface WeekOffsetCorrection {
  id: string;
  correctedDate: Date;
}

/**
 * Consignment stores occasionally deliver using a leftover invoice form
 * from the prior week, so the printed date reads exactly a week early
 * compared to the rest of the same batch — the delivery itself happened
 * on schedule, only the paper is stale. The rest of a batch (regular
 * stores, and most consignment stores too) is dated correctly, so the
 * most common invoice date in the batch is a reliable anchor: any
 * consignment invoice landing exactly 7 days before it gets nudged
 * forward to match. Non-consignment invoices are never touched — a
 * genuinely late regular-store invoice is a real discrepancy, not a
 * paper mixup.
 */
export function findWeekOffsetInvoices(invoices: WeekOffsetCandidate[]): WeekOffsetCorrection[] {
  if (invoices.length === 0) return [];

  const counts = new Map<number, number>();
  for (const inv of invoices) {
    const key = inv.invoiceDate.getTime();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  let modeTime = invoices[0].invoiceDate.getTime();
  let modeCount = 0;
  for (const [time, count] of counts) {
    if (count > modeCount || (count === modeCount && time > modeTime)) {
      modeTime = time;
      modeCount = count;
    }
  }

  const corrections: WeekOffsetCorrection[] = [];
  for (const inv of invoices) {
    if (!inv.isConsignment) continue;
    const diffDays = Math.round((modeTime - inv.invoiceDate.getTime()) / ONE_DAY_MS);
    if (diffDays === 7) {
      corrections.push({ id: inv.id, correctedDate: new Date(inv.invoiceDate.getTime() + 7 * ONE_DAY_MS) });
    }
  }
  return corrections;
}
