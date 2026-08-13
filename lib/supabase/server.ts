import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Cookie-bound Supabase client for Server Components, Server Actions and Route
// Handlers. Reads/writes the auth session via Next's cookie store. In a Server
// Component the cookie store is read-only, so setAll is wrapped in try/catch —
// token refresh is handled by proxy.ts instead.
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component — safe to ignore (proxy refreshes).
          }
        },
      },
    },
  );
}
