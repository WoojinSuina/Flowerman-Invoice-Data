import type { ProcessingJob } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { splitPdfIntoPages } from "@/lib/pdf/splitPages";
import { uploadInvoiceFile } from "@/lib/storage/supabase";
import { triggerPageProcessing } from "@/lib/invoices/pageQueue";

export const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB
export const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
]);

interface PageToUpload {
  buffer: Buffer;
  mimeType: string;
  sourcePage: number;
}

export type IngestResult =
  | { ok: true; job: ProcessingJob }
  | { ok: false; error: string; status: number };

/**
 * Given a whole raw invoice file's bytes (already validated type/size by
 * the caller), splits it into pages, uploads each page to Storage, and
 * queues them for background extraction (see PendingPage in
 * schema.prisma). No Claude Vision calls happen here — this stays fast
 * regardless of file size, which matters for a serverless deployment.
 *
 * Called from app/api/invoices/upload/complete/route.ts, after the raw
 * file has already landed in Storage via a signed upload URL (see
 * lib/storage/supabase.ts's createSignedUpload) — bytes never pass
 * through this Next.js server as a request body, which matters once
 * deployed: Vercel caps a serverless function's request body around
 * 4.5MB, well under a real multi-page scanned PDF.
 */
export async function ingestRawFile(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  origin: string
): Promise<IngestResult> {
  if (!ALLOWED_TYPES.has(mimeType)) {
    return { ok: false, error: `Unsupported file type: ${mimeType}`, status: 400 };
  }
  if (buffer.byteLength > MAX_FILE_BYTES) {
    return { ok: false, error: "File too large (max 20MB)", status: 400 };
  }

  let pages: PageToUpload[];
  if (mimeType === "application/pdf") {
    try {
      const splitPages = await splitPdfIntoPages(buffer);
      pages = splitPages.map((p) => ({
        buffer: p.buffer,
        mimeType: "application/pdf",
        sourcePage: p.pageNumber,
      }));
    } catch (err) {
      return { ok: false, error: `Could not split PDF: ${(err as Error).message}`, status: 400 };
    }
  } else {
    pages = [{ buffer, mimeType, sourcePage: 1 }];
  }

  const job = await prisma.processingJob.create({
    data: { filename, totalPages: pages.length, status: "PENDING" },
  });

  try {
    // Concurrent — these are Storage API calls, not database connections,
    // so they aren't subject to the Postgres connection-pool limit that
    // per-invoice DB writes are.
    const uploadedPages = await Promise.all(
      pages.map(async (page) => {
        const uploaded = await uploadInvoiceFile(page.buffer, page.mimeType);
        return {
          processingJobId: job.id,
          sourcePage: page.sourcePage,
          sourceFileName: filename,
          storageUrl: uploaded.url,
          mimeType: page.mimeType,
        };
      })
    );
    await prisma.pendingPage.createMany({ data: uploadedPages });
  } catch (err) {
    await prisma.processingJob.update({
      where: { id: job.id },
      data: { status: "FAILED", completedAt: new Date() },
    });
    return {
      ok: false,
      error: `Could not upload one or more pages: ${(err as Error).message}`,
      status: 500,
    };
  }

  const processingJob = await prisma.processingJob.update({
    where: { id: job.id },
    data: { status: "PROCESSING" },
  });

  triggerPageProcessing(origin);

  return { ok: true, job: processingJob };
}
