// Split out from lib/elderlyMode.ts, which also imports next/headers
// (server-only) — a client component needs just the cookie name without
// pulling that import into the client bundle.
export const ELDERLY_MODE_COOKIE = "fm_elderly";
