import Shell from "@/app/components/Shell";
import { Empty } from "@/app/components/ui";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { relTime } from "@/lib/format";
import { markAllRead } from "@/app/actions/notifications";
import { paginate } from "@/lib/paginate";
import Pagination from "@/app/components/Pagination";

type SearchParams = { page?: string };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const notes = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const unread = notes.filter((n) => !n.read).length;
  const notesPagination = paginate(notes, Number(sp.page) || 1);

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
            {notesPagination.pageItems.map((n) => (
              <div className="notif" key={n.id}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {!n.read ? <span className="chip info">New</span> : null}
                  <span>{n.message}</span>
                </div>
                <span className="when">{relTime(n.createdAt)}</span>
              </div>
            ))}
            <Pagination paramKey="page" page={notesPagination.page} totalPages={notesPagination.totalPages} />
          </div>
        )}
      </div>
    </Shell>
  );
}
