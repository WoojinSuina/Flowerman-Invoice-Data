import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const BUCKET = process.env.SUPABASE_BUCKET ?? "invoice-scans";

const MIME_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to store invoice images. See .env.example."
    );
  }

  client = createClient(url, serviceRoleKey);
  return client;
}

export interface UploadedFile {
  url: string;
  path: string;
}

export interface SignedUpload {
  signedUrl: string;
  path: string;
}

/**
 * Mints a one-time URL a client (browser or an external script) can PUT
 * raw file bytes to directly — bytes never pass through a Next.js route,
 * which matters once deployed to Vercel: serverless functions cap request
 * bodies at ~4.5MB, well under a real multi-page scanned PDF. Confirmed
 * against the live project that a plain `PUT` to `signedUrl` with no
 * further auth (the token is embedded in the URL) is all a client needs —
 * no Supabase SDK or API key required on the client side.
 */
export async function createSignedUpload(path: string): Promise<SignedUpload> {
  const supabase = getClient();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error) {
    throw new Error(`Could not create signed upload URL: ${error.message}`);
  }
  return { signedUrl: data.signedUrl, path: data.path };
}

/** Builds the storage path a signed upload will land at, same shape as uploadInvoiceFile. */
export function buildStoragePath(mimeType: string): string {
  const ext = MIME_EXTENSIONS[mimeType] ?? "bin";
  const datePrefix = new Date().toISOString().slice(0, 10);
  return `${datePrefix}/${randomUUID()}.${ext}`;
}

/** Downloads a file already in Storage (e.g. one a client PUT via a signed upload URL). */
export async function downloadInvoiceFile(path: string): Promise<Buffer> {
  const supabase = getClient();
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error) {
    throw new Error(`Could not download ${path} from Storage: ${error.message}`);
  }
  return Buffer.from(await data.arrayBuffer());
}

/** Removes a file from Storage — used to clean up the raw whole-file upload once it's been split into pages. */
export async function deleteInvoiceFile(path: string): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) {
    throw new Error(`Could not delete ${path} from Storage: ${error.message}`);
  }
}

/**
 * Uploads a scanned invoice page (image or single-page PDF) to Supabase
 * Storage and returns its public URL. The bucket is public-read (see
 * .env.example) since the app has no auth layer yet — revisit if auth is
 * ever added.
 */
export async function uploadInvoiceFile(
  buffer: Buffer,
  mimeType: string
): Promise<UploadedFile> {
  const ext = MIME_EXTENSIONS[mimeType] ?? "bin";
  const datePrefix = new Date().toISOString().slice(0, 10);
  const path = `${datePrefix}/${randomUUID()}.${ext}`;

  const supabase = getClient();
  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType: mimeType,
    upsert: false,
  });
  if (error) {
    throw new Error(`Supabase Storage upload failed: ${error.message}`);
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}
