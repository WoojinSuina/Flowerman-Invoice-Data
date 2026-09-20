// Store naming convention: if the printed NAME line ends in "CON" (often
// with a leading marker like "*CON", "**CON", or "#CON"), the store is
// consignment — the products on this invoice were actually delivered the
// prior cycle, and this invoice is collecting money for those, not for
// what's physically on the page. Otherwise ("regular"), the money on this
// invoice is for what's on this invoice, no lag.
//
// Confirmed against real store data: the "CON" marker always lands at the
// end of the address half of the printed NAME line, never the chain-name
// half — that's just how the line happens to end before extraction splits
// it into storeName/storeAddress, not a meaningful distinction, so both
// fields are checked here.
export function isConsignmentStore(store: { name: string; address: string | null }): boolean {
  if (/CON$/i.test(store.name.trim())) return true;
  return store.address != null && /CON$/i.test(store.address.trim());
}

// The marker itself is read inconsistently scan-to-scan — confirmed on
// real data: "*CON", "*GON" (C misread as G), "TCON" (stray leading
// character), and no marker at all all occur for the SAME real store.
// Left unhandled, every variant becomes its own Store row via the exact
// (name, address) match in resolveStore(), fragmenting one location's
// invoice history (and, worse, letting a genuine re-scan slip past
// duplicate detection since it's scoped by storeId). Only ever drops the
// LAST whitespace-separated token, and only when that token — after
// stripping a leading */# — is exactly "CON", "GON", or "TCON": a real
// address word long enough to not collide with this (e.g. "FALCON",
// "WAGON") is never a single token equal to just "CON"/"GON"/"TCON", so
// this can't accidentally eat real street-name text.
const CONSIGNMENT_MARKER_WORD = /^T?CON$|^GON$/i;

function normalizeStoreWords(value: string): string {
  const words = value
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w.length > 0);
  const last = words.at(-1)?.replace(/^[*#]+/, "");
  if (last && CONSIGNMENT_MARKER_WORD.test(last)) {
    words.pop();
  }
  return words.join(" ");
}

/**
 * Normalizes a store's name/address for identity comparison — strips the
 * consignment-marker noise above so the same real store isn't split into
 * multiple Store rows just because different scans read that one trailing
 * word differently. Only for comparison; the raw extracted text is still
 * what's stored and displayed (see resolveStore()).
 */
export function normalizeStoreIdentity(store: {
  name: string;
  address: string | null;
}): { name: string; address: string | null } {
  return {
    name: normalizeStoreWords(store.name),
    address: store.address != null ? normalizeStoreWords(store.address) : null,
  };
}
