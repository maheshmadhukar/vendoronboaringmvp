"use client";

import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client (Phase 5 Realtime). Uses the anon key + the
// auth session already stored in cookies by the SSR flow, so Realtime channels
// authorize as the logged-in user and RLS decides which row events they receive.
// Single instance per tab — createBrowserClient memoizes internally.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
