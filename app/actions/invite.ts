"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { setSessionUser } from "@/lib/session";
import { ROLE, VSTATUS } from "@/lib/constants";

async function validInvite(token: string) {
  const invite = await prisma.invite.findUnique({ where: { token } });
  if (!invite) return null;
  if (invite.consumedAt) return null;
  if (invite.expiresAt.getTime() < Date.now()) return null;
  return invite;
}

export async function requestOtpAction(_prev: unknown, formData: FormData) {
  const token = String(formData.get("token") || "");
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirm") || "");

  const invite = await validInvite(token);
  if (!invite) return { error: "This invite link is invalid or has expired." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  if (password !== confirm) return { error: "Passwords do not match." };

  const email = invite.email.toLowerCase();
  const passwordHash = await bcrypt.hash(password, 10);

  // Create/update the (inactive) vendor account tied to the invited vendor.
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.user.update({ where: { id: existing.id }, data: { passwordHash, active: false } });
  } else {
    await prisma.user.create({
      data: {
        email,
        name: email.split("@")[0],
        role: ROLE.VENDOR,
        passwordHash,
        active: false,
        vendorId: invite.vendorId,
      },
    });
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  await prisma.otpCode.create({
    data: { email, code, purpose: "SIGNUP", expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
  });

  redirect(`/invite/${token}/verify`);
}

export async function verifyOtpAction(_prev: unknown, formData: FormData) {
  const token = String(formData.get("token") || "");
  const code = String(formData.get("code") || "").trim();

  const invite = await validInvite(token);
  if (!invite) return { error: "This invite link is invalid or has expired." };

  const email = invite.email.toLowerCase();
  const otp = await prisma.otpCode.findFirst({
    where: { email, purpose: "SIGNUP", consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!otp || otp.expiresAt.getTime() < Date.now())
    return { error: "The code has expired. Go back and request a new one." };
  if (otp.code !== code) return { error: "Incorrect code. Check the code shown below." };

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return { error: "Account not found. Restart the invite." };

  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { active: true } }),
    prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } }),
    prisma.invite.update({ where: { id: invite.id }, data: { consumedAt: new Date() } }),
  ]);

  if (invite.vendorId) {
    const vendor = await prisma.vendor.findUnique({ where: { id: invite.vendorId } });
    if (vendor && vendor.status === VSTATUS.INVITED) {
      await prisma.vendor.update({ where: { id: vendor.id }, data: { status: VSTATUS.DRAFT } });
    }
  }

  await setSessionUser(user.id);
  redirect("/vendor");
}
