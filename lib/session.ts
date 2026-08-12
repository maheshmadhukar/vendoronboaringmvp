import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getIronSession, type IronSession } from "iron-session";
import { prisma } from "./prisma";
import { ROLE, DEPT } from "./constants";

export interface SessionData {
  userId?: string;
  /** Set while impersonating another persona via the demo switcher; the admin to return to. */
  demoAdminId?: string;
}

/** Demo persona switcher (top-right, admin-only) is inert unless DEMO_MODE=true. */
export function isDemoModeEnabled(): boolean {
  return process.env.DEMO_MODE === "true";
}

export const sessionOptions = {
  password: process.env.SESSION_SECRET as string,
  cookieName: "vms_session",
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  },
};

export async function getSession(): Promise<IronSession<SessionData>> {
  const store = await cookies();
  return getIronSession<SessionData>(store, sessionOptions);
}

export async function setSessionUser(userId: string) {
  const session = await getSession();
  session.userId = userId;
  await session.save();
}

export async function clearSession() {
  const session = await getSession();
  session.destroy();
}

export type CurrentUser = Awaited<ReturnType<typeof getCurrentUser>>;

// cache() dedupes this within a single request — every page calls one of
// requireAdmin/requireVendor/requireDept AND Shell calls getCurrentUser
// again; without this each page load did two identical DB round trips.
export const getCurrentUser = cache(async function getCurrentUser() {
  const session = await getSession();
  if (!session.userId) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: {
      department: true,
      vendor: true,
      _count: { select: { notifications: { where: { read: false } } } },
    },
  });
  if (!user || !user.active) return null;
  return user;
});

/** Redirect to /login if not authenticated. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Require a specific role, else /unauthorized. */
export async function requireRole(role: string) {
  const user = await requireUser();
  if (user.role !== role) redirect("/unauthorized");
  return user;
}

export async function requireAdmin() {
  return requireRole(ROLE.ADMIN);
}

export async function requireVendor() {
  const user = await requireRole(ROLE.VENDOR);
  if (!user.vendorId) redirect("/unauthorized");
  return user;
}

/**
 * Require a DEPT user. If deptKey is given, the user must belong to that
 * department (horizontal RBAC) — else /unauthorized.
 *
 * There is no standalone Procurement Manager login: Admin acts as the
 * Procurement department reviewer, so an ADMIN user is let through here
 * (scoped to Procurement only) instead of via requireRole(DEPT).
 */
export async function requireDept(deptKey?: string) {
  const user = await requireUser();
  if (user.role === ROLE.ADMIN) {
    if (deptKey && deptKey !== DEPT.PROCUREMENT) redirect("/unauthorized");
    const department = await prisma.department.findUnique({ where: { key: DEPT.PROCUREMENT } });
    if (!department) redirect("/unauthorized");
    return { ...user, department, departmentId: department.id };
  }
  if (user.role !== ROLE.DEPT) redirect("/unauthorized");
  if (!user.department) redirect("/unauthorized");
  if (deptKey && user.department.key !== deptKey) redirect("/unauthorized");
  return user;
}

/** Landing route for a user based on role. */
export function homeFor(user: { role: string }): string {
  if (user.role === ROLE.ADMIN) return "/admin";
  if (user.role === ROLE.DEPT) return "/dept";
  return "/vendor";
}
