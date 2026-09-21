import { after, NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { processInvoicePage } from "@/lib/invoices/processInvoicePage";
import { claimNextPendingPage, dispatchNextHop, maybeCompleteJob, type ClaimedPage } from "@/lib/invoices/pageQueue";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Processes exactly one queued page, then triggers itself again for the
 * next one — a self-chaining worker rather than a loop over the whole
 * queue in one request, so each individual invocation stays short (safe
 * under a serverless timeout) regardless of how many pages are queued
 * overall. Also doubles as the periodic-sweep target: hitting this with
 * nothing queued is a harmless no-op.
 */
export async function POST(req: NextRequest) {
  const origin = req.nextUrl.origin;

  let claimed: ClaimedPage | null;
  try {
    claimed = await claimNextPendingPage();
  } catch (err) {
    // Confirmed live: an unhandled throw here (e.g. a transient DB pool
    // hiccup) crashes the whole handler before after() is ever registered,
    // silently killing the chain with nothing left to restart it — the
    // exact same failure mode as the very first version of this route, now
    // reachable again because concurrent dispatch+processing doubled the
    // DB load per hop. A failure claiming THIS page doesn't mean the next
    // attempt will also fail, so retry via a fresh dispatch instead of
    // just giving up.
    console.error("process-next: failed to claim a page:", err);
    after(() => dispatchNextHop(origin));
    return NextResponse.json({ processed: false, error: (err as Error).message }, { status: 500 });
  }

  if (!claimed) {
    return NextResponse.json({ processed: false, reason: "queue empty" });
  }

  // `after()` only runs once this response is fully sent, so the dispatch
  // and this page's own processing must be started CONCURRENTLY inside the
  // same callback — sequencing them (dispatch, then await processing, or
  // vice versa) confirmed live to chain every hop's entire Claude Vision
  // time onto the next hop's dispatch, since after() has no way to fire an
  // "earlier" step separately from a "later" one within a single response.
  after(async () => {
    await Promise.allSettled([dispatchNextHop(origin), processClaimedPage(claimed)]);
  });

  return NextResponse.json({ processed: true, sourcePage: claimed.sourcePage });
}

// Everything here can fail in ways that have nothing to do with the next
// hop (a transient DB hiccup, a network blip fetching from Storage) — the
// next hop is dispatched independently in POST above, so a failure here
// just drops this one page (its claim goes stale and gets reclaimed in a
// few minutes if it's still stuck).
async function processClaimedPage(claimed: ClaimedPage): Promise<void> {
  try {
    const fileRes = await fetch(claimed.storageUrl);
    if (!fileRes.ok) {
      // The file itself is missing/unreachable — record it as a failed page
      // and drop it from the queue rather than reclaiming it forever.
      const message = `Could not fetch queued file (${fileRes.status})`;
      await prisma.extractionAttempt.create({
        data: {
          provider: "claude-vision",
          processingJobId: claimed.processingJobId,
          sourcePage: claimed.sourcePage,
          rawResponse: { error: message },
          succeeded: false,
          errorMessage: message,
          sourceImageUrl: claimed.storageUrl,
        },
      });
      await prisma.processingJob.update({
        where: { id: claimed.processingJobId },
        data: { processedPages: { increment: 1 }, failedPages: { increment: 1 } },
      });
      await prisma.pendingPage.delete({ where: { id: claimed.id } });
      await maybeCompleteJob(claimed.processingJobId);
      return;
    }
    const buffer = Buffer.from(await fileRes.arrayBuffer());

    const result = await processInvoicePage({
      buffer,
      mimeType: claimed.mimeType,
      sourceFileName: claimed.sourceFileName,
      sourcePage: claimed.sourcePage,
      processingJobId: claimed.processingJobId,
      sourceImageUrl: claimed.storageUrl,
    });

    // "APPROVED" here always means an exact-$0.00-difference invoice that
    // processInvoicePage auto-approved at creation (a PASS, just skipped the
    // manual click) — count it as passed, not as an unaccounted-for fourth
    // bucket, so passed+review+failed always sums to processed.
    const isPassed =
      result.ok &&
      (result.invoice.validationStatus === "PASS" || result.invoice.validationStatus === "APPROVED");
    await prisma.processingJob.update({
      where: { id: claimed.processingJobId },
      data: {
        processedPages: { increment: 1 },
        passedPages: { increment: isPassed ? 1 : 0 },
        reviewPages: {
          increment: result.ok && result.invoice.validationStatus === "REVIEW" ? 1 : 0,
        },
        failedPages: { increment: result.ok ? 0 : 1 },
      },
    });
    await prisma.pendingPage.delete({ where: { id: claimed.id } });
    await maybeCompleteJob(claimed.processingJobId);
  } catch (err) {
    console.error(`process-next: unhandled error on page ${claimed.sourcePage} (${claimed.id}):`, err);
  }
}
