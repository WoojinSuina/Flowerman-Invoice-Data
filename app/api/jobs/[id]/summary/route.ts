import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const runtime = "nodejs";

/**
 * Polled by the scanner watcher script (scripts/scan-uploader/) right
 * after an upload completes, so it can pop up a notification with the
 * invoice's total due — the whole point being someone scanning an invoice
 * can immediately cross-check it against cash in hand without opening the
 * app. Deliberately tiny/flat JSON: the watcher parses it with sed, not a
 * real JSON parser (see its own comments), so no nested objects beyond one
 * level and no field names that collide with each other as substrings.
 */
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const job = await prisma.processingJob.findUnique({
    where: { id: params.id },
    include: {
      invoices: {
        orderBy: { sourcePage: "asc" },
        select: {
          sourcePage: true,
          invoiceNumber: true,
          totalAmountDueCents: true,
          validationStatus: true,
        },
      },
      extractionAttempts: {
        where: { succeeded: false },
        orderBy: { sourcePage: "asc" },
        select: { sourcePage: true, errorMessage: true },
      },
    },
  });

  if (!job) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    status: job.status,
    totalPages: job.totalPages,
    processedPages: job.processedPages,
    invoices: job.invoices,
    failures: job.extractionAttempts,
  });
}
