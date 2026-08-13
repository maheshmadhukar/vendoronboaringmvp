import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { createClient } from "./supabase/server";
import { ROLE, DEPT } from "./constants";

/** Demo persona switcher (top-right, admin-only) is inert unless DEMO_MODE=true. */
export function isDemoModeEnabled(): boolean {
  return process.env.DEMO_MODE === "true";
}

/** Cookie holding the impersonated user id while an admin uses the demo switcher. */
export const DEMO_COOKIE = "vms_demo";

const userInclude = {
  department: true,
  vendor: true,
  _count: { select: { notifications: { where: { read: false } } } },
} as const;

/** The app User backing the current Supabase auth session (no demo impersonation). */
const getSessionUser = cache(async function getSessionUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Match on the Supabase auth id; fall back to email and self-heal the link
  // (covers accounts created before authUserId was populated).
  let appUser = await prisma.user.findFirst({ where: { authUserId: user.id }, include: userInclude });
  if (!appUser && user.email) {
    appUser = await prisma.user.findFirst({ where: { email: user.email.toLowerCase() }, include: userInclude });
    if (appUser && appUser.authUserId !== user.id) {
      await prisma.user.update({ where: { id: appUser.id }, data: { authUserId: user.id } });
    }
  }
  if (!appUser || !appUser.active) return null;
  return appUser;
});

/** True when an admin is impersonating another persona via the demo switcher. */
export async function isImpersonating(): Promise<boolean> {
  if (!isDemoModeEnabled()) return false;
  const store = await cookies();
  return !!store.get(DEMO_COOKIE)?.value;
}

export type CurrentUser = Awaited<ReturnType<typeof getCurrentUser>>;

// cache() dedupes this within a single request — every page calls one of
// requireAdmin/requireVendor/requireDept AND Shell calls getCurrentUser again.
export const getCurrentUser = cache(async function getCurrentUser() {
  const real = await getSessionUser();

  // Demo-only impersonation: an admin session may act as another persona. The
  // real session must be an admin, so a forged cookie can't escalate.
  if (isDemoModeEnabled() && real?.role === ROLE.ADMIN) {
    const store = await cookies();
    const demoId = store.get(DEMO_COOKIE)?.value;
    if (demoId) {
      const impersonated = await prisma.user.findUnique({ where: { id: demoId }, include: userInclude });
      if (impersonated && impersonated.active) return impersonated;
    }
  }
  return real;
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
