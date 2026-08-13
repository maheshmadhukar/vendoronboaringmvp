"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { setSessionUser, clearSession, homeFor, getSession, requireUser, isDemoModeEnabled } from "@/lib/session";
import { ROLE } from "@/lib/constants";
import { EMAIL_RE } from "@/lib/validation";

export async function loginAction(_prev: unknown, formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  if (!email || !password) return { error: "Enter email and password." };
  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address." };

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active || !user.passwordHash)
    return { error: "Invalid credentials or inactive account." };

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return { error: "Invalid credentials." };

  await setSessionUser(user.id);
  redirect(homeFor(user));
}

// Clears the one-shot "just logged in" flash flag (drives the dept SLA-breach
// popup). Cookie writes are only allowed in a Server Action/Route Handler, so
// this is called from a client effect rather than during the page's render.
export async function consumeLoginFlash() {
  const session = await getSession();
  session.justLoggedIn = false;
  await session.save();
}

export async function logoutAction() {
  await clearSession();
  redirect("/login");
}

// Demo-only persona switch (top-right, gated by DEMO_MODE). Only an admin
// session can start a switch; once switched away from admin, the session's
// stored demoAdminId keeps the switcher working without letting a session
// that never started as admin escalate into another persona.
export async function switchPersonaAction(formData: FormData) {
  if (!isDemoModeEnabled()) redirect("/unauthorized");
  const currentUser = await requireUser();
  const session = await getSession();
  const chained = !!session.demoAdminId;
  if (currentUser.role !== ROLE.ADMIN && !chained) redirect("/unauthorized");

  const email = String(formData.get("email") || "").trim().toLowerCase();
  const target = await prisma.user.findUnique({ where: { email } });
  if (!target || !target.active) redirect("/unauthorized");

  if (!chained) session.demoAdminId = currentUser.id;
  session.userId = target.id;
  await session.save();
  redirect(homeFor(target));
}

export async function returnToAdminAction() {
  if (!isDemoModeEnabled()) redirect("/unauthorized");
  const session = await getSession();
  if (!session.demoAdminId) redirect("/unauthorized");

  const admin = await prisma.user.findUnique({ where: { id: session.demoAdminId } });
  if (!admin || !admin.active) redirect("/unauthorized");

  session.userId = admin.id;
  delete session.demoAdminId;
  await session.save();
  redirect(homeFor(admin));
}
