import { after } from "next/server";
import { prisma } from "@/lib/db/client";

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
 * If this was the last queued page for its job, marks the job done.
 * Called after every page is processed (success or failure) and removed
 * from the queue.
 */
export async function maybeCompleteJob(processingJobId: string): Promise<void> {
  const remaining = await prisma.pendingPage.count({ where: { processingJobId } });
  if (remaining > 0) return;

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
 * Fires the background page-processing chain without making the caller
 * wait for it. Uses `after()` (not a bare un-awaited fetch) so this
 * actually runs on Vercel's serverless runtime — a plain fire-and-forget
 * fetch can get silently dropped there once the response is sent, since
 * the function's execution environment isn't guaranteed to stay alive for
 * work that isn't tracked via `waitUntil`/`after()`. Must be called
 * synchronously during request handling (Next.js requirement for `after`).
 */
export function triggerPageProcessing(origin: string): void {
  after(async () => {
    try {
      await fetch(`${origin}/api/jobs/process-next`, {
        method: "POST",
        // No browser session cookie exists for a server-to-server call —
        // proxy.ts accepts this header as an alternative for this one path.
        headers: { "x-internal-secret": process.env.AUTH_SECRET ?? "" },
      });
    } catch {
      // Best-effort kick — if this particular trigger fails, the next
      // upload's own trigger (or the periodic sweep) picks the queue back
      // up regardless.
    }
  });
}
