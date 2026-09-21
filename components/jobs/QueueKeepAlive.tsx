"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * The self-chaining background worker (each page triggers the next via
 * Vercel's after()) has repeatedly stalled silently in production after a
 * handful of hops, with nothing else around to nudge it forward. While
 * this page is open and something is still queued, poll the same worker
 * endpoint directly from the browser — using the existing session cookie,
 * which proxy.ts already accepts here — so progress keeps moving (and
 * shows up via router.refresh()) without anyone needing to reload by hand.
 */
export function QueueKeepAlive({ active }: { active: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => {
      fetch("/api/jobs/process-next", { method: "POST" })
        .catch(() => {
          // Best-effort — the next tick tries again regardless.
        })
        .finally(() => router.refresh());
    }, 4000);
    return () => clearInterval(interval);
  }, [active, router]);

  return null;
}
