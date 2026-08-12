import { NextResponse } from "next/server";
import { sendSlaReminders } from "@/lib/workflow";

// SLA amber-zone reminders. Previously fired as a side effect of the Admin
// dashboard render (a write during a GET, adding round-trips to every load and
// only running when an admin happened to open the page). Now driven by a
// Vercel Cron (see vercel.json) so it runs on a schedule, off the request path.
//
// Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is
// set; we require it so the endpoint can't be triggered by the public. If
// CRON_SECRET is unset (e.g. local dev), the guard is skipped.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  await sendSlaReminders();
  return NextResponse.json({ ok: true, ranAt: new Date().toISOString() });
}
