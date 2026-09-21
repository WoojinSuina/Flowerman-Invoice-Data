import { cookies } from "next/headers";
import { ELDERLY_MODE_COOKIE } from "@/lib/elderlyModeCookie";

export { ELDERLY_MODE_COOKIE };

/**
 * A toggle-able large-text/bilingual (Japanese+English) mode for a specific
 * user (the account holder's father) who isn't comfortable with the
 * app's normal small English-only text. Kept as an opt-in per-browser
 * cookie rather than the default look, so everyone else's day-to-day view
 * is unchanged. Server Components read this directly; nothing here runs
 * client-side.
 */
export async function isElderlyMode(): Promise<boolean> {
  const store = await cookies();
  return store.get(ELDERLY_MODE_COOKIE)?.value === "1";
}
