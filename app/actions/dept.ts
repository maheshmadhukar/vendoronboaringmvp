"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireDept } from "@/lib/session";
import { loadOwnedDocument } from "@/lib/dept";
import { REVIEW_STATUS, DOC_STATUS, VSTATUS } from "@/lib/constants";
import { recomputeDeptReviewStatus, notify, notifyAdmins, audit } from "@/lib/workflow";

/** Load the review that belongs to THIS dept user's department (horizontal RBAC). */
async function ownReview(vendorId: string) {
  const user = await requireDept();
  const review = await prisma.deptReview.findUnique({
    where: { vendorId_departmentId: { vendorId, departmentId: user.departmentId! } },
    include: { department: true, vendor: true },
  });
  if (!review) redirect("/unauthorized");
  return { user, review: review! };
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

export async function requestDocumentChanges(_prev: unknown, formData: FormData) {
  const documentId = String(formData.get("documentId") || "");
  const comment = String(formData.get("comment") || "").trim();
  if (!comment) return { error: "A comment is required to request changes." };
  const { user, document } = await ownDocument(documentId);
  if (document.vendor.status === VSTATUS.HALTED) return { error: "Onboarding is halted by admin." };

  await prisma.document.update({
    where: { id: documentId },
    data: { status: DOC_STATUS.CHANGES_REQUESTED, reviewNote: comment },
  });
  await prisma.comment.create({
    data: { vendorId: document.vendorId, departmentId: user.departmentId, documentId, authorId: user.id, body: comment, kind: "CLARIFICATION" },
  });
  await audit(user.id, `REQUEST_CHANGES_DOCUMENT`, document.vendorId, comment);
  await notifyVendorAccount(document.vendorId, `${user.department!.name} requested changes on "${document.documentType.name}": ${comment}`);
  await touchReviewMeta(document.vendorId, user.departmentId!, user.id, comment);
  await recomputeDeptReviewStatus(document.vendorId, user.departmentId!);
  revalidatePath(`/dept/review/${document.vendorId}`);
  revalidatePath(`/dept/review/${document.vendorId}/document/${documentId}`);
  revalidatePath("/dept");
  return { ok: "Change request sent to vendor." };
}

export async function rejectDocument(_prev: unknown, formData: FormData) {
  const documentId = String(formData.get("documentId") || "");
  const comment = String(formData.get("comment") || "").trim();
  if (!comment) return { error: "A comment is mandatory when rejecting." };
  const { user, document } = await ownDocument(documentId);
  if (document.vendor.status === VSTATUS.HALTED) return { error: "Onboarding is halted by admin." };

  await prisma.document.update({
    where: { id: documentId },
    data: { status: DOC_STATUS.REJECTED, reviewNote: comment },
  });
  await prisma.comment.create({
    data: { vendorId: document.vendorId, departmentId: user.departmentId, documentId, authorId: user.id, body: comment, kind: "REJECT" },
  });
  await audit(user.id, `REJECT_DOCUMENT`, document.vendorId, comment);
  await notifyVendorAccount(document.vendorId, `${user.department!.name} rejected "${document.documentType.name}": ${comment}`);
  await touchReviewMeta(document.vendorId, user.departmentId!, user.id, comment);
  await recomputeDeptReviewStatus(document.vendorId, user.departmentId!);
  revalidatePath(`/dept/review/${document.vendorId}`);
  revalidatePath(`/dept/review/${document.vendorId}/document/${documentId}`);
  revalidatePath("/dept");
  return { ok: "Document rejected." };
}

/** Lightweight, non-blocking question tied to a document — no status change, no SLA impact. */
export async function clarifyDocument(_prev: unknown, formData: FormData) {
  const documentId = String(formData.get("documentId") || "");
  const comment = String(formData.get("comment") || "").trim();
  if (!comment) return { error: "Describe what you'd like clarified." };
  const { user, document } = await ownDocument(documentId);

  await prisma.comment.create({
    data: { vendorId: document.vendorId, departmentId: user.departmentId, documentId, authorId: user.id, body: comment, kind: "QUESTION" },
  });
  await audit(user.id, `CLARIFY_DOCUMENT`, document.vendorId, comment);
  await notifyVendorAccount(document.vendorId, `${user.department!.name} asked a question about "${document.documentType.name}": ${comment}`);
  revalidatePath(`/dept/review/${document.vendorId}`);
  revalidatePath(`/dept/review/${document.vendorId}/document/${documentId}`);
  revalidatePath("/dept");
  return { ok: "Question sent to vendor." };
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
    case "changes": return requestDocumentChanges(prev, formData);
    case "reject": return rejectDocument(prev, formData);
    case "clarify": return clarifyDocument(prev, formData);
    case "comment": return addDocumentComment(prev, formData);
    default: return { error: "Unknown action." };
  }
}

export async function flagVendor(_prev: unknown, formData: FormData) {
  const vendorId = String(formData.get("vendorId") || "");
  const comment = String(formData.get("comment") || "").trim();
  if (!comment) return { error: "Describe the issue you're flagging." };
  const { user, review } = await ownReview(vendorId);

  await prisma.deptReview.update({ where: { id: review.id }, data: { status: REVIEW_STATUS.FLAGGED, decidedById: user.id, comment } });
  await prisma.vendor.update({ where: { id: vendorId }, data: { status: VSTATUS.FLAGGED } });
  await prisma.comment.create({ data: { vendorId, departmentId: user.departmentId, authorId: user.id, body: comment, kind: "FLAG" } });
  await audit(user.id, `FLAG_${review.department.key}`, vendorId, comment);
  await notifyAdmins(`${review.department.name} flagged "${review.vendor.name}" for audit: ${comment}`, vendorId);
  revalidatePath(`/dept/review/${vendorId}`);
  revalidatePath("/dept");
  return { ok: "Flagged to admin for audit." };
}
