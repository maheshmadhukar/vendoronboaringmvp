"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { loadOwnedDocument } from "@/lib/dept";
import { DOC_STATUS, VSTATUS, REJECTION_REASON } from "@/lib/constants";
import { recomputeDeptReviewStatus, notify, notifyAdmins, audit } from "@/lib/workflow";

/** Coerce a submitted reason to a known REJECTION_REASON value, else null. */
function normalizeReason(raw: FormDataEntryValue | null): string | null {
  const v = String(raw || "").trim();
  return v && v in REJECTION_REASON ? v : null;
}

const ownDocument = loadOwnedDocument;

async function notifyVendorAccount(vendorId: string, message: string) {
  const acct = await prisma.user.findFirst({ where: { vendorId } });
  if (acct) await notify(acct.id, message, "STATUS", vendorId);
}

/** Record who last acted and why, for the department's rollup summary panel. */
async function touchReviewMeta(vendorId: string, departmentId: string, userId: string, comment: string) {
  await prisma.deptReview.update({
    where: { vendorId_departmentId: { vendorId, departmentId } },
    data: { decidedById: userId, comment },
  });
}

export async function approveDocument(_prev: unknown, formData: FormData) {
  const documentId = String(formData.get("documentId") || "");
  const comment = String(formData.get("comment") || "").trim();
  const { user, document } = await ownDocument(documentId);
  if (document.vendor.status === VSTATUS.HALTED) return { error: "Onboarding is halted by admin." };

  await prisma.document.update({
    where: { id: documentId },
    data: { status: DOC_STATUS.APPROVED, reviewNote: null },
  });
  await prisma.comment.create({
    data: { vendorId: document.vendorId, departmentId: user.departmentId, documentId, authorId: user.id, body: comment || `Approved "${document.documentType.name}".`, kind: "APPROVE" },
  });
  await audit(user.id, `APPROVE_DOCUMENT`, document.vendorId, documentId);
  await notifyVendorAccount(document.vendorId, `${user.department!.name} approved "${document.documentType.name}".`);
  await touchReviewMeta(document.vendorId, user.departmentId!, user.id, comment || `Approved "${document.documentType.name}".`);
  await recomputeDeptReviewStatus(document.vendorId, user.departmentId!);
  revalidatePath(`/dept/review/${document.vendorId}`);
  revalidatePath(`/dept/review/${document.vendorId}/document/${documentId}`);
  revalidatePath("/dept");
  return { ok: "Document approved." };
}

export async function rejectDocument(_prev: unknown, formData: FormData) {
  const documentId = String(formData.get("documentId") || "");
  const comment = String(formData.get("comment") || "").trim();
  if (!comment) return { error: "A comment is mandatory when rejecting." };
  const reason = normalizeReason(formData.get("reason"));
  const { user, document } = await ownDocument(documentId);
  if (document.vendor.status === VSTATUS.HALTED) return { error: "Onboarding is halted by admin." };

  await prisma.document.update({
    where: { id: documentId },
    data: { status: DOC_STATUS.REJECTED, reviewNote: comment, rejectionReason: reason },
  });
  await prisma.comment.create({
    data: { vendorId: document.vendorId, departmentId: user.departmentId, documentId, authorId: user.id, body: comment, kind: "REJECT" },
  });
  await audit(user.id, `REJECT_DOCUMENT`, document.vendorId, comment);
  await notifyVendorAccount(document.vendorId, `${user.department!.name} rejected "${document.documentType.name}": ${comment}`);
  // Rejecting a document rolls the whole vendor up to the terminal REJECTED
  // status (see recomputeVendorStatus) — Admin should know without having
  // to be separately flagged for it.
  await notifyAdmins(`${user.department!.name} rejected "${document.documentType.name}" for "${document.vendor.name}": ${comment}`, document.vendorId);
  await touchReviewMeta(document.vendorId, user.departmentId!, user.id, comment);
  await recomputeDeptReviewStatus(document.vendorId, user.departmentId!);
  revalidatePath(`/dept/review/${document.vendorId}`);
  revalidatePath(`/dept/review/${document.vendorId}/document/${documentId}`);
  revalidatePath("/dept");
  return { ok: "Document rejected." };
}

/**
 * A question tied to a document. Plain (unchecked "needs resubmission"): no
 * status change, no SLA impact — just a comment + notification. With
 * "needs resubmission" checked: also puts the document into
 * CHANGES_REQUESTED so the vendor can re-upload it (this is what used to be
 * a separate "Request changes" action — folded in here so certificate docs
 * keep just 3 buttons: Approve / Reject / Ask for clarification).
 */
export async function clarifyDocument(_prev: unknown, formData: FormData) {
  const documentId = String(formData.get("documentId") || "");
  const comment = String(formData.get("comment") || "").trim();
  if (!comment) return { error: "Describe what you'd like clarified." };
  const needsResubmission = formData.get("needsResubmission") === "on";
  const reason = normalizeReason(formData.get("reason"));
  const { user, document } = await ownDocument(documentId);
  if (needsResubmission && document.vendor.status === VSTATUS.HALTED) return { error: "Onboarding is halted by admin." };

  if (needsResubmission) {
    await prisma.document.update({
      where: { id: documentId },
      data: { status: DOC_STATUS.CHANGES_REQUESTED, reviewNote: comment, rejectionReason: reason },
    });
  }
  await prisma.comment.create({
    data: { vendorId: document.vendorId, departmentId: user.departmentId, documentId, authorId: user.id, body: comment, kind: needsResubmission ? "CLARIFICATION" : "QUESTION" },
  });
  await audit(user.id, needsResubmission ? "REQUEST_CHANGES_DOCUMENT" : "CLARIFY_DOCUMENT", document.vendorId, comment);
  await notifyVendorAccount(
    document.vendorId,
    `${user.department!.name} ${needsResubmission ? "requested changes on" : "asked a question about"} "${document.documentType.name}": ${comment}`
  );
  if (needsResubmission) {
    await touchReviewMeta(document.vendorId, user.departmentId!, user.id, comment);
    await recomputeDeptReviewStatus(document.vendorId, user.departmentId!);
  }
  revalidatePath(`/dept/review/${document.vendorId}`);
  revalidatePath(`/dept/review/${document.vendorId}/document/${documentId}`);
  revalidatePath("/dept");
  return { ok: needsResubmission ? "Change request sent to vendor." : "Question sent to vendor." };
}

/** A plain remark on a document's comment thread — no status change, no vendor question implied. */
export async function addDocumentComment(_prev: unknown, formData: FormData) {
  const documentId = String(formData.get("documentId") || "");
  const comment = String(formData.get("comment") || "").trim();
  if (!comment) return { error: "Write a comment first." };
  const { user, document } = await ownDocument(documentId);

  await prisma.comment.create({
    data: { vendorId: document.vendorId, departmentId: user.departmentId, documentId, authorId: user.id, body: comment, kind: "NOTE" },
  });
  await audit(user.id, `COMMENT_DOCUMENT`, document.vendorId, comment);
  await notifyVendorAccount(document.vendorId, `${user.department!.name} commented on "${document.documentType.name}": ${comment}`);
  revalidatePath(`/dept/review/${document.vendorId}/document/${documentId}`);
  return { ok: "Comment added." };
}

/** Single dispatcher used by each document's review form (one form per document, multiple buttons). */
export async function documentReviewAction(prev: unknown, formData: FormData) {
  const intent = String(formData.get("intent") || "");
  switch (intent) {
    case "approve": return approveDocument(prev, formData);
    case "reject": return rejectDocument(prev, formData);
    case "clarify": return clarifyDocument(prev, formData);
    case "comment": return addDocumentComment(prev, formData);
    default: return { error: "Unknown action." };
  }
}

