// Shared UTC-based month/week helpers for the Dashboard and Review filters.
// UTC is used throughout to avoid server-local-timezone display bugs (a
// prior bug: week labels shifted a day because toLocaleDateString ran
// without an explicit timeZone).

export function parseMonthParam(month: string | undefined): Date {
  if (month) {
    const match = month.match(/^(\d{4})-(\d{2})$/);
    if (match) {
      const year = Number(match[1]);
      const monthIndex = Number(match[2]) - 1;
      if (monthIndex >= 0 && monthIndex <= 11) {
        return new Date(Date.UTC(year, monthIndex, 1));
      }
    }
  }
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function monthParam(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

// For a plain calendar date (no time-of-day component, stored as UTC
// midnight) — never call toLocaleDateString on it directly, since a
// server running behind UTC (e.g. America/Chicago) renders UTC midnight as
// the previous local day. Use this everywhere an Invoice.invoiceDate (or
// similar) is shown to a person.
export function formatInvoiceDate(date: Date): string {
  return date.toLocaleDateString(undefined, { timeZone: "UTC" });
}

export function formatMonthLabel(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
}

// Weeks start on Sunday.
export function getWeekStart(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d;
}

export function weekParam(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function parseWeekParam(week: string): Date | null {
  const match = week.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

export function formatWeekLabel(weekStart: Date): string {
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
  return `${fmt(weekStart)} – ${fmt(weekEnd)}`;
}

function validUtcDate(year: number, monthIndex: number, day: number): Date | null {
  const date = new Date(Date.UTC(year, monthIndex, day));
  // Date.UTC silently rolls an out-of-range month/day into a different
  // date (e.g. day 32 becomes the 1st/2nd of the next month) instead of
  // erroring — reject anything that didn't round-trip exactly.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== monthIndex ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

// Parses a free-typed search box date (the Review search bar) into a UTC
// midnight Date, or null if it doesn't look like a date at all — in which
// case the caller falls back to matching invoice #/store name instead.
// Accepts "YYYY-MM-DD" and US "M/D/YYYY" or "M/D/YY" (2-digit year prefixed
// with "20", same convention the extraction prompt uses).
export function parseSearchDate(input: string): Date | null {
  const trimmed = input.trim();

  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const [, y, m, d] = iso;
    return validUtcDate(Number(y), Number(m) - 1, Number(d));
  }

  const us = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (us) {
    const [, m, d, yRaw] = us;
    const year = yRaw.length === 2 ? 2000 + Number(yRaw) : Number(yRaw);
    return validUtcDate(year, Number(m) - 1, Number(d));
  }

  return null;
}

// A delivery invoice can never be dated after today — this is a hard
// business-logic fact, not a heuristic. Used to force REVIEW on an
// impossible date (usually a month/day swap on a hard-to-read scan) instead
// of trusting whatever the model output even if the math otherwise reconciled.
export function isFutureDate(date: Date): boolean {
  const now = new Date();
  const todayUtcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return date.getTime() > todayUtcMidnight;
}
