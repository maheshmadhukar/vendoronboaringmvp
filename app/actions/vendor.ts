"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireVendor } from "@/lib/session";
import { VSTATUS, DOC_STATUS, REVIEW_STATUS, SLA_STATE } from "@/lib/constants";
import { createDeptReviews, recomputeVendorStatus, notifyDept, notify, getConfig } from "@/lib/workflow";
import { resumeDue } from "@/lib/sla";
import { getVendorDocTypes } from "@/lib/vendor";

const GSTIN_RE = /^[0-9]{2}[A-Z0-9]{10}[0-9A-Z]{3}$/i;

// Save/update the vendor's own business details (also used for draft save).
export async function saveBusinessDetails(_prev: unknown, formData: FormData) {
  const user = await requireVendor();
  const vendorId = user.vendorId!;
  const gstin = String(formData.get("gstin") || "").trim();
  const bankAccount = String(formData.get("bankAccount") || "").trim();
  const address = String(formData.get("address") || "").trim();
  const phone = String(formData.get("phone") || "").trim();

  if (!address || !phone || !bankAccount)
    return { error: "Address, phone and bank account details are mandatory." };
  if (gstin && !GSTIN_RE.test(gstin))
    return { error: "GSTIN format looks invalid (expected e.g. 27ABCDE1234F1Z5)." };

  // Duplicate-vendor guard: same GSTIN on a different vendor record.
  if (gstin) {
    const dupe = await prisma.vendor.findFirst({
      where: { gstin: { equals: gstin }, NOT: { id: vendorId } },
    });
    if (dupe) return { error: `A vendor with this GSTIN already exists (${dupe.name}). Contact procurement.` };
  }

  await prisma.vendor.update({
    where: { id: vendorId },
    data: {
      name: String(formData.get("name") || user.vendor?.name || "").trim() || undefined,
      address, phone, bankAccount,
      contactPerson: String(formData.get("contactPerson") || "").trim() || null,
      gstin: gstin || null,
      turnover: formData.get("turnover") ? Number(formData.get("turnover")) : null,
      companyEmail: String(formData.get("companyEmail") || "").trim() || null,
    },
  });
  revalidatePath("/vendor");
  return { ok: "Business details saved." };
}

// Upload (mock) a single document.
export async function uploadDocument(_prev: unknown, formData: FormData) {
  const user = await requireVendor();
  const vendorId = user.vendorId!;
  const documentTypeId = String(formData.get("documentTypeId") || "");
  const file = formData.get("file") as File | null;
  if (!file || !file.name) return { error: "Choose a file to upload." };

  const dt = await prisma.documentType.findUnique({ where: { id: documentTypeId } });
  if (!dt) return { error: "Unknown document type." };

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const okFormats = dt.acceptedFormats.split(",").map((f) => f.trim().toLowerCase());
  if (!okFormats.includes(ext))
    return { error: `Invalid format for ${dt.name}. Accepted: ${dt.acceptedFormats}.` };
  if (file.size > dt.maxSizeMb * 1024 * 1024)
    return { error: `${dt.name} exceeds the ${dt.maxSizeMb}MB limit.` };

  const existing = await prisma.document.findFirst({ where: { vendorId, documentTypeId } });
  const data = {
    filename: file.name,
    storedPath: `/uploads/${vendorId}/${file.name}`,
    sizeKb: Math.round(file.size / 1024),
    status: DOC_STATUS.SUBMITTED,
    reviewNote: null,
    uploadedAt: new Date(),
  };
  if (existing) await prisma.document.update({ where: { id: existing.id }, data });
  else await prisma.document.create({ data: { vendorId, documentTypeId, ...data } });

  revalidatePath("/vendor/documents");
  return { ok: `${dt.name} uploaded.` };
}

// Submit the whole application (all mandatory docs in one go).
export async function submitApplication() {
  const user = await requireVendor();
  const vendorId = user.vendorId!;
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor) return { error: "Vendor not found." };
  if (![VSTATUS.DRAFT, VSTATUS.INVITED].includes(vendor.status as never))
    return { error: "Application already submitted." };

  if (!vendor.address || !vendor.phone || !vendor.bankAccount)
    return { error: "Complete your business details before submitting." };

  const vendorTypes = await getVendorDocTypes(vendorId);
  const types = vendorTypes.filter((t) => t.mandatory);
  const docs = await prisma.document.findMany({ where: { vendorId } });
  const uploaded = new Set(docs.filter((d) => d.status !== DOC_STATUS.PENDING).map((d) => d.documentTypeId));
  const missing = types.filter((t) => !uploaded.has(t.id));
  if (missing.length > 0)
    return { error: `Upload all mandatory documents before submitting. Missing: ${missing.map((m) => m.name).join(", ")}.` };

  const now = new Date();
  await prisma.vendor.update({ where: { id: vendorId }, data: { status: VSTATUS.SUBMITTED, submittedAt: now } });
  await createDeptReviews(vendorId, now);
  await prisma.vendor.update({ where: { id: vendorId }, data: { status: VSTATUS.IN_REVIEW } });

  const reviews = await prisma.deptReview.findMany({ where: { vendorId } });
  for (const r of reviews) await notifyDept(r.departmentId, `New vendor "${vendor.name}" is awaiting your review.`, vendorId);

  revalidatePath("/vendor");
  return { ok: "Application submitted for review." };
}

// Resubmit after a change request (mandatory clarification comment).
export async function resubmitApplication(_prev: unknown, formData: FormData) {
  const user = await requireVendor();
  const vendorId = user.vendorId!;
  const comment = String(formData.get("comment") || "").trim();
  if (!comment) return { error: "A clarification comment is required to resubmit." };

  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    include: { deptReviews: true },
  });
  if (!vendor) return { error: "Vendor not found." };

  const changed = vendor.deptReviews.filter((r) => r.status === REVIEW_STATUS.CHANGES_REQUESTED);
  if (changed.length === 0) return { error: "No department has requested changes." };

  for (const r of changed) {
    // Resume SLA: extend due date by the paused duration.
    let due = r.slaDueAt;
    if (r.slaDueAt && r.slaPausedAt) due = resumeDue(r.slaDueAt, r.slaPausedAt);
    await prisma.deptReview.update({
      where: { id: r.id },
      data: { status: REVIEW_STATUS.PENDING, slaState: SLA_STATE.RUNNING, slaDueAt: due, slaPausedAt: null },
    });
    await notifyDept(r.departmentId, `${vendor.name} resubmitted with a clarification.`, vendorId);
  }

  // Re-open documents that were sent back.
  await prisma.document.updateMany({
    where: { vendorId, status: DOC_STATUS.CHANGES_REQUESTED },
    data: { status: DOC_STATUS.SUBMITTED, reviewNote: null },
  });

  await prisma.comment.create({
    data: { vendorId, authorId: user.id, body: comment, kind: "RESUBMIT" },
  });

  await recomputeVendorStatus(vendorId);
  revalidatePath("/vendor");
  return { ok: "Resubmitted. The relevant departments have been notified." };
}

export async function signBuyerDoc(formData: FormData) {
  const user = await requireVendor();
  const id = String(formData.get("id") || "");
  const doc = await prisma.vendorBuyerDoc.findUnique({ where: { id } });
  if (!doc || doc.vendorId !== user.vendorId) redirect("/unauthorized");

  await prisma.vendorBuyerDoc.update({
    where: { id },
    data: { signedAt: new Date(), signedByName: user.name },
  });
  revalidatePath("/vendor/buyer-documents");
  revalidatePath("/admin");
}
