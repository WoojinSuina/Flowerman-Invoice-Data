import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { splitPdfIntoPages } from "@/lib/pdf/splitPages";
import { uploadInvoiceFile } from "@/lib/storage/supabase";
import { triggerPageProcessing } from "@/lib/invoices/pageQueue";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB — keep below next.config.ts's proxyClientMaxBodySize
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf"]);

interface PageToUpload {
  buffer: Buffer;
  mimeType: string;
  sourcePage: number;
}

/**
 * Deliberately fast: split the PDF and upload every page's bytes to
 * Storage, then hand off to the background queue (see PendingPage in
 * schema.prisma) — no Claude Vision calls happen in this request. A large
 * multi-page PDF extracting every page synchronously here would risk
 * blowing through Vercel's serverless function timeout once deployed, and
 * ties up the browser tab for as long as extraction takes either way.
 */
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
    return NextResponse.json({ error: `Unsupported file type: ${file.type}` }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "File too large (max 20MB)" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let pages: PageToUpload[];
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
    data: { filename: file.name, totalPages: pages.length, status: "PENDING" },
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
          sourceFileName: file.name,
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
    return NextResponse.json(
      { error: "Could not upload one or more pages", detail: (err as Error).message },
      { status: 500 }
    );
  }

  const processingJob = await prisma.processingJob.update({
    where: { id: job.id },
    data: { status: "PROCESSING" },
  });

  triggerPageProcessing(req.nextUrl.origin);

  return NextResponse.json({ job: processingJob });
}
