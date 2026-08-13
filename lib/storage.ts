import { createClient } from "@supabase/supabase-js";

// Server-only Supabase client (service role) for file storage. NEVER import this
// into a client component — the service key bypasses RLS. Uploads/downloads all
// go through the server (server actions + server components issuing signed URLs),
// so the bucket stays private.
export const DOCS_BUCKET = "vendor-docs";

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase storage not configured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * True when `path` is a real Storage object key. Legacy/mock records stored a
 * fabricated path beginning with "/" (e.g. "/uploads/…"); real keys never do.
 */
export function isStoredObject(path: string | null | undefined): path is string {
  return !!path && !path.startsWith("/");
}

function sanitize(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, "_");
}

export function documentKey(vendorId: string, documentId: string, filename: string): string {
  return `documents/${vendorId}/${documentId}/${sanitize(filename)}`;
}

export function templateKey(key: string, filename: string): string {
  return `templates/${key}/${sanitize(filename)}`;
}

export async function uploadObject(
  key: string,
  bytes: Buffer | Uint8Array | ArrayBuffer,
  contentType: string,
): Promise<string> {
  const body = bytes instanceof ArrayBuffer ? Buffer.from(bytes) : bytes;
  const { error } = await admin().storage.from(DOCS_BUCKET).upload(key, body, { contentType, upsert: true });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  return key;
}

/**
 * Time-limited signed URL for a private object. `download` (a filename) forces a
 * download with that name instead of inline display. Returns null if the object
 * is missing or signing fails, so callers can fall back to an empty state.
 */
export async function signedUrl(
  key: string,
  opts: { download?: string; ttlSeconds?: number } = {},
): Promise<string | null> {
  const { download, ttlSeconds = 3600 } = opts;
  const { data, error } = await admin()
    .storage.from(DOCS_BUCKET)
    .createSignedUrl(key, ttlSeconds, download ? { download } : undefined);
  if (error || !data) return null;
  return data.signedUrl;
}

export async function removeObject(key: string): Promise<void> {
  await admin().storage.from(DOCS_BUCKET).remove([key]);
}
