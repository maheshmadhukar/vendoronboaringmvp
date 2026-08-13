import { createClient } from "@supabase/supabase-js";

// Service-role Supabase client for privileged auth admin operations (creating
// users during invite/seed). Server-only — the service key bypasses RLS and must
// never reach the browser.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
