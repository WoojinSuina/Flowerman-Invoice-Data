/**
 * Large-text/bilingual (Japanese+English) mode, always on for everyone —
 * previously an opt-in per-browser toggle, but there was no real need for
 * a separate "normal" small-text mode, so it's now just how the app looks.
 * Kept as a function (rather than inlining `true` at every call site) so
 * turning this into a real per-user preference again later, if ever
 * needed, only touches this one file.
 */
export async function isElderlyMode(): Promise<boolean> {
  return true;
}
