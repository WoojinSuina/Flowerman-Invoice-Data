import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { splitPdfIntoPages } from "@/lib/pdf/splitPages";
import { processInvoicePage, type ProcessPageResult } from "@/lib/invoices/processInvoicePage";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB — keep below next.config.ts's proxyClientMaxBodySize
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf"]);

interface PageToProcess {
  buffer: Buffer;
  mimeType: string;
  sourcePage: number;
}

export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (err) {
    return NextResponse.json(
      { error: "Could not read the uploaded file", detail: (err as Error).message },
      { status: 400 }
    );
  }
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: `Unsupported file type: ${file.type}` },
      { status: 400 }
    );
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "File too large (max 15MB)" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let pages: PageToProcess[];
  if (file.type === "application/pdf") {
    try {
      const splitPages = await splitPdfIntoPages(buffer);
      pages = splitPages.map((p) => ({
        buffer: p.buffer,
        mimeType: "application/pdf",
        sourcePage: p.pageNumber,
      }));
    } catch (err) {
      return NextResponse.json(
        { error: "Could not split PDF", detail: (err as Error).message },
        { status: 400 }
      );
    }
  } else {
    pages = [{ buffer, mimeType: file.type, sourcePage: 1 }];
  }

  const job = await prisma.processingJob.create({
    data: { filename: file.name, totalPages: pages.length, status: "PROCESSING" },
  });

  const results: ProcessPageResult[] = [];
  for (const page of pages) {
    const result = await processInvoicePage({
      buffer: page.buffer,
      mimeType: page.mimeType,
      sourceFileName: file.name,
      sourcePage: page.sourcePage,
      processingJobId: job.id,
    });
    results.push(result);

    await prisma.processingJob.update({
      where: { id: job.id },
      data: {
        processedPages: { increment: 1 },
        passedPages: {
          increment: result.ok && result.invoice.validationStatus === "PASS" ? 1 : 0,
        },
        reviewPages: {
          increment: result.ok && result.invoice.validationStatus === "REVIEW" ? 1 : 0,
        },
        failedPages: { increment: result.ok ? 0 : 1 },
      },
    });
  }

  const anyFailed = results.some((r) => !r.ok);
  const completedJob = await prisma.processingJob.update({
    where: { id: job.id },
    data: {
      status: anyFailed ? "COMPLETED_WITH_ERRORS" : "COMPLETED",
      completedAt: new Date(),
    },
  });

  const responseResults = results.map((r) =>
    r.ok === true
      ? { sourcePage: r.invoice.sourcePage, invoice: r.invoice, validation: r.validation }
      : { sourcePage: r.sourcePage, error: r.error }
  );

  return NextResponse.json({ job: completedJob, results: responseResults });
}
