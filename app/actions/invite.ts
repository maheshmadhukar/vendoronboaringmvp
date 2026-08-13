"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ROLE, VSTATUS } from "@/lib/constants";

async function validInvite(token: string) {
  const invite = await prisma.invite.findUnique({ where: { token } });
  if (!invite) return null;
  if (invite.consumedAt) return null;
  if (invite.expiresAt.getTime() < Date.now()) return null;
  return invite;
}

// Accept an invite: create the Supabase Auth user with the chosen password,
// link/activate the app account, consume the invite, and sign the vendor in.
// (Supabase owns credentials now — no custom OTP, no bcrypt.)
export async function acceptInviteAction(_prev: unknown, formData: FormData) {
  const token = String(formData.get("token") || "");
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirm") || "");

  const invite = await validInvite(token);
  if (!invite) return { error: "This invite link is invalid or has expired." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  if (password !== confirm) return { error: "Passwords do not match." };

  const email = invite.email.toLowerCase();

  // Create the Supabase auth identity (email pre-confirmed — the invite link is
  // the proof of email ownership).
  const admin = createAdminClient();
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !created.user) {
    return { error: "Could not create your account. This email may already be registered — try signing in." };
  }
  const authUserId = created.user.id;

  // Create/update the app account tied to the invited vendor and activate it.
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.user.update({ where: { id: existing.id }, data: { authUserId, active: true } });
  } else {
    await prisma.user.create({
      data: {
        email,
        name: email.split("@")[0],
        role: ROLE.VENDOR,
        authUserId,
        active: true,
        vendorId: invite.vendorId,
      },
    });
  }

  await prisma.invite.update({ where: { id: invite.id }, data: { consumedAt: new Date() } });

  if (invite.vendorId) {
    const vendor = await prisma.vendor.findUnique({ where: { id: invite.vendorId } });
    if (vendor && vendor.status === VSTATUS.INVITED) {
      await prisma.vendor.update({
        where: { id: vendor.id },
        data: { status: VSTATUS.DRAFT, registeredAt: vendor.registeredAt ?? new Date() },
      });
    }
  }

  // Sign in (sets the session cookies) and land on the vendor workspace.
  const supabase = await createClient();
  const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
  if (signInErr) redirect("/login");

  redirect("/vendor");
}
