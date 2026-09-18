import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const BUCKET = process.env.SUPABASE_BUCKET ?? "invoice-scans";

const MIME_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
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

export interface UploadedInvoiceImage {
  url: string;
  path: string;
}

/**
 * Uploads a scanned invoice image to Supabase Storage and returns its
 * public URL. The bucket is public-read (see .env.example) since the app
 * has no auth layer yet — revisit if auth is ever added.
 */
export async function uploadInvoiceImage(
  buffer: Buffer,
  mimeType: string
): Promise<UploadedInvoiceImage> {
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
