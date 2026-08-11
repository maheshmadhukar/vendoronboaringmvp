import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { ROLE, DEPT_LABEL } from "@/lib/constants";
import { logoutAction } from "@/app/actions/auth";

type NavItem = { href: string; label: string; icon: string; key: string };

const NAV: Record<string, NavItem[]> = {
  ADMIN: [
    { href: "/admin", label: "Status Dashboard", icon: "▚", key: "dashboard" },
    { href: "/admin/access", label: "Access & Invites", icon: "✦", key: "access" },
    { href: "/admin/config", label: "Configuration", icon: "⚙", key: "config" },
    { href: "/admin/analytics", label: "Analytics", icon: "◔", key: "analytics" },
  ],
  DEPT: [{ href: "/dept", label: "Review Queue", icon: "✔", key: "queue" }],
  VENDOR: [
    { href: "/vendor", label: "Overview", icon: "▚", key: "overview" },
    { href: "/vendor/onboarding", label: "Business Details", icon: "✎", key: "form" },
    { href: "/vendor/documents", label: "Documents", icon: "▤", key: "docs" },
    { href: "/vendor/buyer-documents", label: "Buyer Documents", icon: "⎘", key: "buyerdocs" },
  ],
};

export default async function Shell({
  active,
  title,
  crumbs,
  children,
}: {
  active?: string;
  title: string;
  crumbs?: React.ReactNode;
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const unread = await prisma.notification.count({
    where: { userId: user.id, read: false },
  });

  const items = NAV[user.role] ?? [];
  const roleLabel =
    user.role === ROLE.ADMIN
      ? "Administrator"
      : user.role === ROLE.DEPT
      ? `${DEPT_LABEL[user.department?.key ?? ""] ?? "Department"} Dept`
      : "Vendor";

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">V</div>
          <div className="brand-text">
            <strong>Vendor Portal</strong>
            <span>Onboarding</span>
          </div>
        </div>
        <nav className="nav">
          {items.map((it) => (
            <Link
              key={it.key}
              href={it.href}
              className={`nav-item ${active === it.key ? "active" : ""}`}
            >
              <span className="ico">{it.icon}</span>
              {it.label}
            </Link>
          ))}
          <Link
            href="/notifications"
            className={`nav-item ${active === "notifications" ? "active" : ""}`}
          >
            <span className="ico">◉</span>
            Notifications {unread > 0 ? <span className="chip bad" style={{ marginLeft: "auto" }}>{unread}</span> : null}
          </Link>
        </nav>
        <div className="sidebar-foot">
          <div className="who">
            <b>{user.name}</b>
            <span>{roleLabel} · {user.email}</span>
          </div>
          <form action={logoutAction}>
            <button className="btn sm ghost" style={{ width: "100%" }}>Sign out</button>
          </form>
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <div className="title">{title}</div>
          <div className="right">
            <Link href="/notifications" className="btn sm ghost" aria-label="Notifications">
              ◉ {unread > 0 ? <span className="chip bad">{unread}</span> : null}
            </Link>
          </div>
        </div>
        <div className="content">
          {crumbs ? <div className="crumbs">{crumbs}</div> : null}
          {children}
        </div>
      </div>
    </div>
  );
}
