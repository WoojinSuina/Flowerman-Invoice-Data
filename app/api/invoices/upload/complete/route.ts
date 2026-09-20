import { NextRequest, NextResponse } from "next/server";
import { ingestRawFile } from "@/lib/invoices/ingestRawFile";
import { deleteInvoiceFile, downloadInvoiceFile } from "@/lib/storage/supabase";

export const runtime = "nodejs";

interface CompleteRequestBody {
  path?: string;
  filename?: string;
  mimeType?: string;
}

/**
 * Step 2 of 2: the caller has already PUT the raw file to the signed URL
 * from .../upload/init (see that route). This fetches those bytes back
 * from Storage — an outbound download from inside the function, not an
 * inbound request body, so it isn't subject to Vercel's ~4.5MB request
 * body cap — then runs the normal split/queue pipeline. The raw whole-file
 * object is deleted afterward; only the split per-page copies persist.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as CompleteRequestBody;
  const { path, filename, mimeType } = body;

  if (!path || typeof path !== "string") {
    return NextResponse.json({ error: "path is required" }, { status: 400 });
  }
  if (!filename || typeof filename !== "string") {
    return NextResponse.json({ error: "filename is required" }, { status: 400 });
  }
  if (!mimeType || typeof mimeType !== "string") {
    return NextResponse.json({ error: "mimeType is required" }, { status: 400 });
  }

  let buffer: Buffer;
  try {
    buffer = await downloadInvoiceFile(path);
  } catch (err) {
    return NextResponse.json(
      { error: "Could not retrieve uploaded file", detail: (err as Error).message },
      { status: 400 }
    );
  }

  const result = await ingestRawFile(buffer, filename, mimeType, req.nextUrl.origin);

  // Best-effort cleanup — the split pages are what matter going forward;
  // an orphaned raw copy left behind on a rare delete failure isn't worth
  // failing the whole upload over.
  await deleteInvoiceFile(path).catch(() => {});

  if (result.ok === false) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ job: result.job });
}
