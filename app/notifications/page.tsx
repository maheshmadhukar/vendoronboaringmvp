import Shell from "@/app/components/Shell";
import { Empty } from "@/app/components/ui";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { relTime } from "@/lib/format";
import { markAllRead } from "@/app/actions/notifications";

export default async function NotificationsPage() {
  const user = await requireUser();
  const notes = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const unread = notes.filter((n) => !n.read).length;

  return (
    <Shell active="notifications" title="Notifications">
      <div className="page-head">
        <div>
          <h1>Notifications</h1>
          <p>In-app alerts about your onboarding tasks and status changes.</p>
        </div>
        {unread > 0 ? (
          <form action={markAllRead}>
            <button className="btn sm">Mark all read ({unread})</button>
          </form>
        ) : null}
      </div>

      <div className="card">
        {notes.length === 0 ? (
          <Empty title="No notifications" hint="You're all caught up." />
        ) : (
          <div>
            {notes.map((n) => (
              <div className="notif" key={n.id}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {!n.read ? <span className="chip info">New</span> : null}
                  <span>{n.message}</span>
                </div>
                <span className="when">{relTime(n.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Shell>
  );
}
