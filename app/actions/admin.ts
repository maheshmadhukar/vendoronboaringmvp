"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { VSTATUS } from "@/lib/constants";
import { recomputeVendorStatus, notify, audit, getConfig } from "@/lib/workflow";

async function notifyVendorAccount(vendorId: string, message: string) {
  const acct = await prisma.user.findFirst({ where: { vendorId } });
  if (acct) await notify(acct.id, message, "STATUS", vendorId);
}

// Invite a new vendor (buyer-initiated only). Duplicate guard included.
export async function inviteVendor(_prev: unknown, formData: FormData) {
  const admin = await requireAdmin();
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  if (!name || !email) return { error: "Vendor name and email are required." };

  const dupe = await prisma.vendor.findFirst({
    where: { OR: [{ companyEmail: email }, { name: { equals: name } }] },
  });
  if (dupe) return { error: `A vendor "${dupe.name}" already exists in the database.` };
  const dupeUser = await prisma.user.findUnique({ where: { email } });
  if (dupeUser) return { error: "A user with this email already exists." };

  const vendor = await prisma.vendor.create({
    data: { name, companyEmail: email, status: VSTATUS.INVITED, createdById: admin.id },
  });
  const token = randomUUID();
  await prisma.invite.create({
    data: { email, token, vendorId: vendor.id, createdById: admin.id, expiresAt: new Date(Date.now() + 7 * 864e5) },
  });
  await audit(admin.id, "INVITE_VENDOR", vendor.id, email);
  revalidatePath("/admin/access");
  return { ok: `Invite created for ${name}.`, link: `/invite/${token}` };
}

export async function setUserActive(formData: FormData) {
  await requireAdmin();
  const userId = String(formData.get("userId") || "");
  const active = String(formData.get("active") || "") === "true";
  await prisma.user.update({ where: { id: userId }, data: { active } });
  revalidatePath("/admin/access");
}

export async function assignManager(formData: FormData) {
  await requireAdmin();
  const departmentId = String(formData.get("departmentId") || "");
  const userId = String(formData.get("userId") || "");
  const role = String(formData.get("role") || ""); // PRIMARY | SECONDARY
  if (!departmentId || !userId || !role) return;
  await prisma.user.update({ where: { id: userId }, data: { managerRole: role, departmentId } });
  await prisma.department.update({
    where: { id: departmentId },
    data: role === "PRIMARY" ? { primaryManagerId: userId } : { secondaryManagerId: userId },
  });
  revalidatePath("/admin/access");
}

export async function updateConfig(_prev: unknown, formData: FormData) {
  await requireAdmin();
  await prisma.config.update({
    where: { id: 1 },
    data: {
      cutoffHour: Number(formData.get("cutoffHour") || 14),
      slaDaysDefault: Number(formData.get("slaDaysDefault") || 5),
      finalApprovalRequired: formData.get("finalApprovalRequired") === "on",
      aiReviewDefault: formData.get("aiReviewDefault") === "on",
      notifyVendorOnStatus: formData.get("notifyVendorOnStatus") === "on",
      notifyDeptOnSla: formData.get("notifyDeptOnSla") === "on",
      notifyDeptOnResubmit: formData.get("notifyDeptOnResubmit") === "on",
    },
  });
  // per-dept SLA
  const depts = await prisma.department.findMany();
  for (const d of depts) {
    const v = formData.get(`sla_${d.id}`);
    if (v != null) await prisma.department.update({ where: { id: d.id }, data: { slaDays: Number(v) } });
  }
  revalidatePath("/admin/config");
  return { ok: "Configuration saved." };
}

export async function updateDocType(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  await prisma.documentType.update({
    where: { id },
    data: {
      acceptedFormats: String(formData.get("acceptedFormats") || "pdf,doc"),
      maxSizeMb: Number(formData.get("maxSizeMb") || 5),
      mandatory: formData.get("mandatory") === "on",
    },
  });
  revalidatePath("/admin/config");
}

export async function haltVendor(formData: FormData) {
  const admin = await requireAdmin();
  const vendorId = String(formData.get("vendorId") || "");
  const reason = String(formData.get("reason") || "").trim() || "Halted by admin.";
  await prisma.vendor.update({ where: { id: vendorId }, data: { status: VSTATUS.HALTED, haltReason: reason } });
  await audit(admin.id, "HALT", vendorId, reason);
  await notifyVendorAccount(vendorId, `Your onboarding has been halted: ${reason}`);
  revalidatePath(`/admin/vendors/${vendorId}`);
  revalidatePath("/admin");
}

export async function resumeVendor(formData: FormData) {
  const admin = await requireAdmin();
  const vendorId = String(formData.get("vendorId") || "");
  await prisma.vendor.update({ where: { id: vendorId }, data: { status: VSTATUS.IN_REVIEW, haltReason: null } });
  await recomputeVendorStatus(vendorId);
  await audit(admin.id, "RESUME", vendorId);
  revalidatePath(`/admin/vendors/${vendorId}`);
  revalidatePath("/admin");
}

export async function clearFlag(formData: FormData) {
  const admin = await requireAdmin();
  const vendorId = String(formData.get("vendorId") || "");
  await prisma.deptReview.updateMany({
    where: { vendorId, status: "FLAGGED" },
    data: { status: "PENDING", slaState: "RUNNING" },
  });
  await prisma.vendor.update({ where: { id: vendorId }, data: { status: VSTATUS.IN_REVIEW } });
  await recomputeVendorStatus(vendorId);
  await audit(admin.id, "CLEAR_FLAG", vendorId);
  revalidatePath(`/admin/vendors/${vendorId}`);
  revalidatePath("/admin");
}

export async function finalApprove(formData: FormData) {
  const admin = await requireAdmin();
  const vendorId = String(formData.get("vendorId") || "");
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId }, include: { deptReviews: true } });
  if (!vendor) return;
  const allApproved = vendor.deptReviews.length > 0 && vendor.deptReviews.every((r) => r.status === "APPROVED");
  if (!allApproved) return; // guard: cannot final-approve until all depts approve
  await prisma.vendor.update({ where: { id: vendorId }, data: { status: VSTATUS.ONBOARDED, onboardedAt: new Date() } });
  await audit(admin.id, "FINAL_APPROVE", vendorId);
  await notifyVendorAccount(vendorId, "🎉 You have been fully onboarded.");
  revalidatePath(`/admin/vendors/${vendorId}`);
  revalidatePath("/admin");
}
