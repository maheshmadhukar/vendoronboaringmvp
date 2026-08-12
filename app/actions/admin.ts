"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { VSTATUS } from "@/lib/constants";
import { recomputeVendorStatus, notify, audit, getConfig } from "@/lib/workflow";

const DOC_FORMATS = ["doc", "pdf", "jpeg"] as const;

/** UPPER_SNAKE key from a free-text name, e.g. "Quality Assurance" -> "QUALITY_ASSURANCE". */
function slugifyKey(name: string): string {
  return name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

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

  const templateIds = formData.getAll("templateIds").map(String).filter(Boolean);
  if (formData.get("sendMsaNda") === "on") {
    const msaNda = await prisma.buyerDocTemplate.findMany({
      where: { key: { in: ["MSA", "NDA"] }, active: true },
      select: { id: true },
    });
    for (const t of msaNda) if (!templateIds.includes(t.id)) templateIds.push(t.id);
  }
  if (templateIds.length > 0) {
    await prisma.vendorBuyerDoc.createMany({
      data: templateIds.map((templateId) => ({ vendorId: vendor.id, templateId })),
    });
  }

  await audit(admin.id, "INVITE_VENDOR", vendor.id, email);
  revalidatePath("/admin/access");
  return { ok: `Invite created for ${name}.`, link: `/invite/${token}` };
}

export async function updateDeptManagerEmail(_prev: unknown, formData: FormData) {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") || "");
  const email = String(formData.get("email") || "").trim().toLowerCase();
  if (!email) return { error: "Email cannot be blank." };

  const dupe = await prisma.user.findUnique({ where: { email } });
  if (dupe && dupe.id !== userId) return { error: "A user with this email already exists." };

  await prisma.user.update({ where: { id: userId }, data: { email } });
  await audit(admin.id, "UPDATE_USER_EMAIL", userId, email);
  revalidatePath("/admin/access");
  return { ok: "Email updated." };
}

export async function setUserActive(formData: FormData) {
  await requireAdmin();
  const userId = String(formData.get("userId") || "");
  const active = String(formData.get("active") || "") === "true";
  await prisma.user.update({ where: { id: userId }, data: { active } });
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
  await Promise.all(
    depts.map((d) => {
      const v = formData.get(`sla_${d.id}`);
      return v != null ? prisma.department.update({ where: { id: d.id }, data: { slaDays: Number(v) } }) : null;
    })
  );
  revalidatePath("/admin/config");
  return { ok: "Configuration saved." };
}

export async function updateDocType(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  const format = String(formData.get("acceptedFormats") || "doc");
  await prisma.documentType.update({
    where: { id },
    data: {
      acceptedFormats: DOC_FORMATS.includes(format as never) ? format : "doc",
      maxSizeMb: Number(formData.get("maxSizeMb") || 5),
      mandatory: formData.get("mandatory") === "on",
    },
  });
  revalidatePath("/admin/config");
}

export async function createDocumentType(_prev: unknown, formData: FormData) {
  const admin = await requireAdmin();
  const name = String(formData.get("name") || "").trim();
  const departmentId = String(formData.get("departmentId") || "");
  const format = String(formData.get("format") || "doc");
  const maxSizeMb = Number(formData.get("maxSizeMb") || 5);
  const mandatory = formData.get("mandatory") === "on";
  if (!name) return { error: "Document name is required." };
  if (!departmentId) return { error: "Pick a department to route this document to." };

  const dept = await prisma.department.findUnique({ where: { id: departmentId } });
  if (!dept) return { error: "Selected department not found." };

  const key = slugifyKey(name);
  const existing = await prisma.documentType.findUnique({ where: { key } });
  if (existing) return { error: `A document type named "${name}" already exists.` };

  const maxOrder = await prisma.documentType.aggregate({ _max: { order: true } });
  await prisma.documentType.create({
    data: {
      key, name, departmentKey: dept.key,
      acceptedFormats: DOC_FORMATS.includes(format as never) ? format : "doc",
      maxSizeMb, mandatory, active: true,
      order: (maxOrder._max.order ?? 0) + 1,
    },
  });
  await audit(admin.id, "CREATE_DOCUMENT_TYPE", undefined, key);
  revalidatePath("/admin/config");
  return { ok: `Document type "${name}" added.` };
}

export async function setDocumentTypeActive(formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") || "");
  const active = String(formData.get("active") || "") === "true";
  const dt = await prisma.documentType.update({ where: { id }, data: { active } });
  await audit(admin.id, active ? "RESTORE_DOCUMENT_TYPE" : "REMOVE_DOCUMENT_TYPE", undefined, dt.key);
  revalidatePath("/admin/config");
}

// Replace the (mocked) default file on a buyer document template. Like every
// other upload in this app, only filename/size metadata is captured — no
// file bytes are read or stored.
export async function replaceBuyerDocTemplateFile(_prev: unknown, formData: FormData) {
  const admin = await requireAdmin();
  const id = String(formData.get("id") || "");
  const file = formData.get("file") as File | null;
  if (!file || !file.name) return { error: "Choose a file to upload." };

  const template = await prisma.buyerDocTemplate.findUnique({ where: { id } });
  if (!template) return { error: "Unknown document template." };

  await prisma.buyerDocTemplate.update({
    where: { id },
    data: {
      filename: file.name,
      storedPath: `/templates/${template.key}/${file.name}`,
      sizeKb: Math.round(file.size / 1024),
      uploadedAt: new Date(),
    },
  });
  await audit(admin.id, "REPLACE_BUYER_DOC_TEMPLATE_FILE", undefined, template.key);
  revalidatePath("/admin/config");
  return { ok: `${template.name} file replaced.` };
}

export async function haltVendor(formData: FormData) {
  const admin = await requireAdmin();
  const vendorId = String(formData.get("vendorId") || "");
  const reason = String(formData.get("reason") || "").trim() || "Onboarding paused by admin.";
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
