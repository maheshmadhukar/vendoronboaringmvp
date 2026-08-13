"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Sub = {
  /** Postgres table name, e.g. "Notification" | "Vendor" | "DeptReview" | "Document". */
  table: string;
  /**
   * Optional realtime filter, e.g. `userId=eq.<id>`. Only INSERT/UPDATE/DELETE
   * on rows matching this (and passing the table's RLS SELECT policy) fire.
   */
  filter?: string;
};

/**
 * Phase 5 Realtime — invalidation only, not a data channel.
 *
 * Subscribes to Postgres changes for the given tables and calls
 * router.refresh() so the server components re-render with fresh data. This
 * keeps all RBAC/queries server-side (single source of truth) — the client
 * never reads row payloads, it only learns "something you can see changed".
 *
 * Refreshes are coalesced (300ms) so a burst of related writes triggers one
 * refetch. Silently no-ops if Supabase env/session is unavailable.
 */
export default function RealtimeRefresh({
  subscriptions,
  channelName,
}: {
  subscriptions: Sub[];
  /** Unique per mounted instance so multiple subscribers don't collide. */
  channelName: string;
}) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable key so the effect doesn't resubscribe on every render.
  const subsKey = JSON.stringify(subscriptions);

  useEffect(() => {
    const supabase = createClient();
    const subs: Sub[] = JSON.parse(subsKey);
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    const scheduleRefresh = (payload: { table?: string; eventType?: string }) => {
      // Log only the shape of the change, never the row payload (row data is
      // RLS-scoped to this user but still shouldn't land in the console).
      console.debug(`[rt:${channelName}] change ${payload?.table}/${payload?.eventType}`);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 300);
    };

    (async () => {
      // Realtime authorizes postgres_changes against RLS as the JWT's role, so
      // the websocket MUST carry the user's access token. The SSR cookie client
      // loads the session asynchronously — set it explicitly before subscribing,
      // else the socket connects as `anon` and the `authenticated` policies
      // never match (zero events delivered).
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) supabase.realtime.setAuth(token);
      if (cancelled) return;

      let ch = supabase.channel(channelName);
      for (const s of subs) {
        ch = ch.on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: s.table,
            ...(s.filter ? { filter: s.filter } : {}),
          },
          scheduleRefresh,
        );
      }
      ch.subscribe((status) => console.debug(`[rt:${channelName}] status`, status));
      channel = ch;
    })();

    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
      if (channel) supabase.removeChannel(channel);
    };
    // subsKey + channelName fully capture the subscription config.
  }, [subsKey, channelName, router]);

  return null;
}
