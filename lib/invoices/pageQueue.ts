import { after } from "next/server";
import { prisma } from "@/lib/db/client";
import { findWeekOffsetInvoices } from "./weekOffsetDates";

export interface ClaimedPage {
  id: string;
  processingJobId: string;
  sourcePage: number;
  sourceFileName: string;
  storageUrl: string;
  mimeType: string;
}

/**
 * Atomically claims the oldest pending page so two concurrent chain links
 * (or a chain link racing the periodic sweep) can never grab the same row —
 * `FOR UPDATE SKIP LOCKED` lets Postgres hand each concurrent caller a
 * different row instead of blocking on the same one. A claim older than 5
 * minutes is treated as abandoned (e.g. the function crashed mid-request)
 * and reclaimed, so one bad page can't stall the whole queue forever.
 */
export async function claimNextPendingPage(): Promise<ClaimedPage | null> {
  const rows = await prisma.$queryRaw<ClaimedPage[]>`
    UPDATE pending_pages
    SET claimed_at = NOW()
    WHERE id = (
      SELECT id FROM pending_pages
      WHERE claimed_at IS NULL OR claimed_at < NOW() - make_interval(mins => 5)
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING
      id,
      processing_job_id AS "processingJobId",
      source_page AS "sourcePage",
      source_file_name AS "sourceFileName",
      storage_url AS "storageUrl",
      mime_type AS "mimeType"
  `;
  return rows[0] ?? null;
}

/**
 * A store's invoice can end up written on a leftover form from the prior
 * week's pad, so the printed date reads a week early even though the
 * delivery itself happened on schedule. Runs once the whole batch is in
 * so the "most common week" anchor it compares against is reliable, and
 * nudges forward any invoice landing exactly one week before it — see
 * findWeekOffsetInvoices.
 */
async function reconcileWeekOffsetDates(processingJobId: string): Promise<void> {
  const invoices = await prisma.invoice.findMany({
    where: { processingJobId },
    select: { id: true, invoiceDate: true },
  });
  const corrections = findWeekOffsetInvoices(invoices);
  for (const correction of corrections) {
    await prisma.invoice.update({
      where: { id: correction.id },
      data: { invoiceDate: correction.correctedDate },
    });
  }
}

/**
 * If this was the last queued page for its job, marks the job done.
 * Called after every page is processed (success or failure) and removed
 * from the queue.
 */
export async function maybeCompleteJob(processingJobId: string): Promise<void> {
  const remaining = await prisma.pendingPage.count({ where: { processingJobId } });
  if (remaining > 0) return;

  await reconcileWeekOffsetDates(processingJobId);

  const job = await prisma.processingJob.findUniqueOrThrow({ where: { id: processingJobId } });
  await prisma.processingJob.update({
    where: { id: processingJobId },
    data: {
      status: job.failedPages > 0 ? "COMPLETED_WITH_ERRORS" : "COMPLETED",
      completedAt: new Date(),
    },
  });
}

/**
 * Fires a single request at the self-chaining worker and waits only a few
 * seconds for it to be dispatched — not for the page it picks up to finish
 * processing. Confirmed live that awaiting the full response chained the
 * next hop's entire Claude Vision processing time onto whatever was
 * awaiting this call, and once that combined wait exceeded the caller's
 * own `maxDuration` budget the outbound fetch never made it out, silently
 * killing the whole chain a few hops in. Aborting here only stops the
 * caller from waiting on the response; the next invocation keeps running
 * once dispatched regardless of whether anyone is still listening for its
 * reply.
 */
export async function dispatchNextHop(origin: string): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    await fetch(`${origin}/api/jobs/process-next`, {
      method: "POST",
      // No browser session cookie exists for a server-to-server call —
      // proxy.ts accepts this header as an alternative for this one path.
      headers: { "x-internal-secret": process.env.AUTH_SECRET ?? "" },
      signal: controller.signal,
    });
  } catch {
    // Best-effort kick — if this particular dispatch fails, the next
    // upload's own trigger (or the periodic sweep) picks the queue back
    // up regardless.
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fires the background page-processing chain without making the caller
 * wait for it. Uses `after()` (not a bare un-awaited fetch) so this
 * actually runs on Vercel's serverless runtime — a plain fire-and-forget
 * fetch can get silently dropped there once the response is sent, since
 * the function's execution environment isn't guaranteed to stay alive for
 * work that isn't tracked via `waitUntil`/`after()`. Must be called
 * synchronously during request handling (Next.js requirement for `after`).
 *
 * For use from an ordinary request handler (e.g. right after a new job is
 * queued) — NOT from inside `process-next`'s own `after()` callback, which
 * calls `dispatchNextHop` directly instead so it can run concurrently with
 * that page's own processing rather than nesting one `after()` in another.
 */
export function triggerPageProcessing(origin: string): void {
  after(() => dispatchNextHop(origin));
}
