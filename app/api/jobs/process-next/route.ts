import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { processInvoicePage } from "@/lib/invoices/processInvoicePage";
import { claimNextPendingPage, maybeCompleteJob, triggerPageProcessing } from "@/lib/invoices/pageQueue";

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
  const claimed = await claimNextPendingPage();
  if (!claimed) {
    return NextResponse.json({ processed: false, reason: "queue empty" });
  }

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
    triggerPageProcessing(req.nextUrl.origin);
    return NextResponse.json({ processed: true, sourcePage: claimed.sourcePage, ok: false });
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

  triggerPageProcessing(req.nextUrl.origin);

  return NextResponse.json({ processed: true, sourcePage: claimed.sourcePage, ok: result.ok });
}
