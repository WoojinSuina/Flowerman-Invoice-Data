/**
 * All currency in FLOWER MAN is represented as integer CENTS internally.
 * Never do arithmetic on floating-point dollar amounts — floats cannot
 * represent currency exactly and will produce false REVIEW flags.
 *
 * dollars <-> cents conversion happens ONLY at the UI/input boundary.
 */

/** Convert a dollar amount (e.g. from a form input or AI extraction) to integer cents. */
export function dollarsToCents(dollars: number): number {
  if (!Number.isFinite(dollars)) {
    throw new Error(`dollarsToCents received a non-finite value: ${dollars}`);
  }
  // Round rather than truncate, and use a small epsilon nudge to avoid
  // 0.1 + 0.2 style float artifacts before rounding.
  return Math.round(dollars * 100 + Number.EPSILON * Math.sign(dollars));
}

/** Convert integer cents back to a dollar number for display. */
export function centsToDollars(cents: number): number {
  return cents / 100;
}

/** Format cents as a USD string, e.g. 8459 -> "$84.59". */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const remainder = (abs % 100).toString().padStart(2, "0");
  return `${sign}$${dollars.toLocaleString("en-US")}.${remainder}`;
}

export const CURRENCY_TOLERANCE_CENTS = 1; // $0.01, per spec §3

/**
 * Format cents as whole dollars, e.g. 3625225 -> "$36,252" — for compact
 * display (chart labels, etc.) where exact cents add clutter without
 * adding useful information at that scale.
 */
export function formatWholeDollars(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const dollars = Math.round(Math.abs(cents) / 100);
  return `${sign}$${dollars.toLocaleString("en-US")}`;
}
