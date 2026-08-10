"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { setSessionUser, clearSession, homeFor } from "@/lib/session";

export async function loginAction(_prev: unknown, formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  if (!email || !password) return { error: "Enter email and password." };

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active || !user.passwordHash)
    return { error: "Invalid credentials or inactive account." };

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return { error: "Invalid credentials." };

  await setSessionUser(user.id);
  redirect(homeFor(user));
}

export async function logoutAction() {
  await clearSession();
  redirect("/login");
}
