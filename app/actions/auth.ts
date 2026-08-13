"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { homeFor, getCurrentUser, isImpersonating, isDemoModeEnabled, DEMO_COOKIE, setLoginFlash, clearLoginFlash } from "@/lib/session";
import { ROLE } from "@/lib/constants";
import { EMAIL_RE } from "@/lib/validation";

export async function loginAction(_prev: unknown, formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  if (!email || !password) return { error: "Enter email and password." };
  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Invalid credentials." };

  // Ensure there's an active app account behind this identity.
  const user = await prisma.user.findFirst({ where: { email } });
  if (!user || !user.active) {
    await supabase.auth.signOut();
    return { error: "Invalid credentials or inactive account." };
  }

  // One-shot flash so the dept SLA-breach popup fires once on the landing page.
  await setLoginFlash();
  redirect(homeFor(user));
}

// Clears the one-shot "just logged in" flash flag (drives the dept SLA-breach
// popup). Cookie writes are only allowed in a Server Action/Route Handler, so
// this is called from a client effect rather than during the page's render.
export async function consumeLoginFlash() {
  await clearLoginFlash();
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const store = await cookies();
  store.delete(DEMO_COOKIE);
  redirect("/login");
}

// Demo-only persona switch (top-right, gated by DEMO_MODE). Only an admin
// session (or an already-impersonating admin session) can start a switch. The
// underlying Supabase session always remains the admin's — the DEMO_COOKIE only
// changes which persona getCurrentUser resolves to.
export async function switchPersonaAction(formData: FormData) {
  if (!isDemoModeEnabled()) redirect("/unauthorized");
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");
  const allowed = currentUser.role === ROLE.ADMIN || (await isImpersonating());
  if (!allowed) redirect("/unauthorized");

  const email = String(formData.get("email") || "").trim().toLowerCase();
  const target = await prisma.user.findFirst({ where: { email } });
  if (!target || !target.active) redirect("/unauthorized");

  const store = await cookies();
  if (target.role === ROLE.ADMIN) {
    // Switching back to the admin persona is just clearing the impersonation.
    store.delete(DEMO_COOKIE);
  } else {
    store.set(DEMO_COOKIE, target.id, { httpOnly: true, sameSite: "lax", path: "/" });
  }
  redirect(homeFor(target));
}

export async function returnToAdminAction() {
  if (!isDemoModeEnabled()) redirect("/unauthorized");
  const store = await cookies();
  store.delete(DEMO_COOKIE);
  redirect("/admin");
}
