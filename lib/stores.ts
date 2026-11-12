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

/**
 * The brand/chain word a store's identity is keyed on alongside its
 * printed number — see resolveStore(). Confirmed on real data: the first
 * word of the extracted name (SHELL, EXXON, CHEVRON, VALERO, 7-11, ...)
 * stays consistent across rescans even when the rest of the name/address
 * split drifts (e.g. "VALERO" vs "VALERO FOREST HILL / ENON" for the same
 * store), so it's a safer identity signal than the full name string.
 */
export function extractBrand(name: string): string {
  return name.trim().toUpperCase().split(/\s+/)[0] ?? "";
}

function bigramSet(value: string): Set<string> {
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const bigrams = new Set<string>();
  for (let i = 0; i < normalized.length - 1; i++) {
    bigrams.add(normalized.slice(i, i + 2));
  }
  return bigrams;
}

// Character-bigram Dice coefficient — tolerant of the single-letter
// typos, transpositions, and truncated/appended noise OCR produces on the
// SAME real address (e.g. "MACCART AVE" read as "MAGCART AVE", or a
// trailing "CASH"/"CON" that comes and goes), while still scoring two
// genuinely different street addresses as dissimilar even when they
// share a city or highway name.
function diceCoefficient(a: string, b: string): number {
  const bigramsA = bigramSet(a);
  const bigramsB = bigramSet(b);
  if (bigramsA.size === 0 && bigramsB.size === 0) return 1;
  if (bigramsA.size === 0 || bigramsB.size === 0) return 0;
  let shared = 0;
  for (const bigram of bigramsA) {
    if (bigramsB.has(bigram)) shared++;
  }
  return (2 * shared) / (bigramsA.size + bigramsB.size);
}

// Picked from real examples: ordinary OCR noise on the same address
// scores well above this (e.g. "MACCART AVE FT WORTH/I:CON" vs "MAGCART
// AVE FT WORTH/I 20N" ~0.85); two different real addresses that happened
// to collide on a (storeNumber, brand) pair score well below it (e.g.
// "2221 W SEMINARY DR FT WORTH" vs "MACCART AVE FT WORTH/I:CON" ~0.33,
// an actual collision found in this app's own data).
const ADDRESS_SIMILARITY_THRESHOLD = 0.5;

/**
 * True when a newly extracted address looks like a different real
 * location than the one already on file for the same (storeNumber,
 * brand) — the signal resolveStore() uses to flag a possible store
 * collision for REVIEW instead of silently attaching an invoice to the
 * wrong store's history. No address on either side (nothing on file yet,
 * or nothing extracted this time) means nothing to compare — not flagged.
 */
export function isUnfamiliarAddress(onFile: string | null, extracted: string | null): boolean {
  if (!onFile || !extracted) return false;
  return diceCoefficient(onFile, extracted) < ADDRESS_SIMILARITY_THRESHOLD;
}
