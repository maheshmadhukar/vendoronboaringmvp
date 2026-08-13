"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireVendor } from "@/lib/session";
import { VSTATUS, DOC_STATUS } from "@/lib/constants";
import { createDeptReviews, recomputeVendorStatus, notifyDept, notify, getConfig, audit } from "@/lib/workflow";
import { getVendorDocTypes } from "@/lib/vendor";
import { documentKey, uploadObject } from "@/lib/storage";

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
      // Stamp the moment the vendor first begins onboarding (engagement analytics).
      onboardingStartedAt: user.vendor?.onboardingStartedAt ?? new Date(),
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
  // Re-uploading a doc the department sent back counts as a resubmission cycle.
  const isResubmit = existing?.status === DOC_STATUS.CHANGES_REQUESTED || existing?.status === DOC_STATUS.REJECTED;

  // Persist the real bytes to Supabase Storage under a key derived from the
  // document id, and record that key in storedPath.
  const bytes = Buffer.from(await file.arrayBuffer());
  const contentType = file.type || "application/octet-stream";

  const data = {
    filename: file.name,
    sizeKb: Math.round(file.size / 1024),
    status: DOC_STATUS.SUBMITTED,
    reviewNote: null,
    rejectionReason: null,
    uploadedAt: new Date(),
  };
  if (existing) {
    const key = await uploadObject(documentKey(vendorId, existing.id, file.name), bytes, contentType);
    await prisma.document.update({
      where: { id: existing.id },
      data: isResubmit ? { ...data, storedPath: key, revisionCount: { increment: 1 } } : { ...data, storedPath: key },
    });
  } else {
    // Create first to get the id, then upload under that id and store the key.
    const created = await prisma.document.create({ data: { vendorId, documentTypeId, ...data } });
    const key = await uploadObject(documentKey(vendorId, created.id, file.name), bytes, contentType);
    await prisma.document.update({ where: { id: created.id }, data: { storedPath: key } });
  }

  // First activity also marks onboarding as started, if the form save didn't.
  if (!user.vendor?.onboardingStartedAt) {
    await prisma.vendor.update({ where: { id: vendorId }, data: { onboardingStartedAt: new Date() } });
  }

  // Record the resubmission so rework/turnaround analytics can see it.
  if (isResubmit) {
    await prisma.comment.create({
      data: { vendorId, documentId: existing!.id, authorId: user.id, body: `Resubmitted "${dt.name}".`, kind: "RESUBMIT" },
    });
    await audit(user.id, "RESUBMIT_DOCUMENT", vendorId, dt.name);
  }

  revalidatePath("/vendor/documents");
  return { ok: `${dt.name} uploaded.` };
}

// Submit the whole application (all required docs in one go).
export async function submitApplication() {
  const user = await requireVendor();
  const vendorId = user.vendorId!;
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor) return { error: "Vendor not found." };
  if (![VSTATUS.DRAFT, VSTATUS.INVITED].includes(vendor.status as never))
    return { error: "Application already submitted." };

  if (!vendor.address || !vendor.phone || !vendor.bankAccount)
    return { error: "Complete your business details before submitting." };

  const types = await getVendorDocTypes(vendorId);
  const docs = await prisma.document.findMany({ where: { vendorId } });
  const uploaded = new Set(docs.filter((d) => d.status !== DOC_STATUS.PENDING).map((d) => d.documentTypeId));
  const missing = types.filter((t) => !uploaded.has(t.id));
  if (missing.length > 0)
    return { error: `Upload all required documents before submitting. Missing: ${missing.map((m) => m.name).join(", ")}.` };

  const now = new Date();
  await prisma.vendor.update({ where: { id: vendorId }, data: { status: VSTATUS.SUBMITTED, submittedAt: now } });
  await createDeptReviews(vendorId, now);
  await prisma.vendor.update({ where: { id: vendorId }, data: { status: VSTATUS.IN_REVIEW } });

  const reviews = await prisma.deptReview.findMany({ where: { vendorId } });
  await Promise.all(
    reviews.map((r) => notifyDept(r.departmentId, `New vendor "${vendor.name}" is awaiting your review.`, vendorId))
  );

  revalidatePath("/vendor");
  return { ok: "Application submitted for review." };
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

// Vendor's reply in the clarification thread — closes the loop on a dept's
// "Ask for clarification" question. Posted as a plain comment (no status
// change), and notifies whichever department the reply is aimed at.
export async function replyToComment(_prev: unknown, formData: FormData) {
  const user = await requireVendor();
  const vendorId = user.vendorId!;
  const body = String(formData.get("body") || "").trim();
  if (!body) return { error: "Write a reply first." };
  const departmentId = String(formData.get("departmentId") || "") || null;
  const documentId = String(formData.get("documentId") || "") || null;

  await prisma.comment.create({
    data: { vendorId, departmentId, documentId, authorId: user.id, body, kind: "NOTE" },
  });
  await audit(user.id, "VENDOR_REPLY", vendorId, body);
  if (departmentId) await notifyDept(departmentId, `${user.vendor?.name ?? "The vendor"} replied: ${body}`, vendorId);

  revalidatePath("/vendor");
  if (documentId) {
    revalidatePath("/vendor/documents");
    revalidatePath(`/dept/review/${vendorId}`);
    revalidatePath(`/dept/review/${vendorId}/document/${documentId}`);
  }
  return { ok: "Reply sent." };
}
