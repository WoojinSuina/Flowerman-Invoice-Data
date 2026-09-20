import { NextRequest, NextResponse } from "next/server";
import { ALLOWED_TYPES, MAX_FILE_BYTES } from "@/lib/invoices/ingestRawFile";
import { buildStoragePath, createSignedUpload } from "@/lib/storage/supabase";

export const runtime = "nodejs";

interface InitRequestBody {
  filename?: string;
  mimeType?: string;
  size?: number;
}

/**
 * Step 1 of 2 for uploading a file (browser or an external client like the
 * scanner watcher): mints a signed Storage URL the caller PUTs the raw
 * bytes to directly, then calls .../upload/complete with the resulting
 * path. This request/response is pure small JSON — no file bytes ever
 * pass through this route, which is the whole point (see
 * ingestRawFile.ts's docstring).
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as InitRequestBody;
  const { filename, mimeType, size } = body;

  if (!filename || typeof filename !== "string") {
    return NextResponse.json({ error: "filename is required" }, { status: 400 });
  }
  if (!mimeType || !ALLOWED_TYPES.has(mimeType)) {
    return NextResponse.json({ error: `Unsupported file type: ${mimeType}` }, { status: 400 });
  }
  if (typeof size !== "number" || size <= 0) {
    return NextResponse.json({ error: "size is required" }, { status: 400 });
  }
  if (size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "File too large (max 20MB)" }, { status: 400 });
  }

  const path = buildStoragePath(mimeType);
  const { signedUrl } = await createSignedUpload(path);

  return NextResponse.json({ signedUrl, path });
}
