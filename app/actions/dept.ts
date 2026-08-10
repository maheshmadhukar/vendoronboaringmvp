"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireDept } from "@/lib/session";
import { REVIEW_STATUS, DOC_STATUS, SLA_STATE, VSTATUS } from "@/lib/constants";
import { recomputeVendorStatus, notify, notifyAdmins, audit } from "@/lib/workflow";

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

async function notifyVendorAccount(vendorId: string, message: string) {
  const acct = await prisma.user.findFirst({ where: { vendorId } });
  if (acct) await notify(acct.id, message, "STATUS", vendorId);
}

export async function approveReview(_prev: unknown, formData: FormData) {
  const vendorId = String(formData.get("vendorId") || "");
  const { user, review } = await ownReview(vendorId);
  if (review.vendor.status === VSTATUS.HALTED) return { error: "Onboarding is halted by admin." };

  await prisma.deptReview.update({
    where: { id: review.id },
    data: { status: REVIEW_STATUS.APPROVED, slaState: SLA_STATE.MET, decidedById: user.id, comment: String(formData.get("comment") || "") || null },
  });
  await prisma.document.updateMany({
    where: { vendorId, documentType: { departmentKey: review.department.key } },
    data: { status: DOC_STATUS.APPROVED },
  });
  await audit(user.id, `APPROVE_${review.department.key}`, vendorId);
  await notifyVendorAccount(vendorId, `${review.department.name} approved your submission.`);
  await recomputeVendorStatus(vendorId);
  revalidatePath(`/dept/review/${vendorId}`);
  revalidatePath("/dept");
  return { ok: "Approved." };
}

export async function requestChanges(_prev: unknown, formData: FormData) {
  const vendorId = String(formData.get("vendorId") || "");
  const comment = String(formData.get("comment") || "").trim();
  if (!comment) return { error: "A comment is required to request changes." };
  const { user, review } = await ownReview(vendorId);
  if (review.vendor.status === VSTATUS.HALTED) return { error: "Onboarding is halted by admin." };

  await prisma.deptReview.update({
    where: { id: review.id },
    data: { status: REVIEW_STATUS.CHANGES_REQUESTED, slaState: SLA_STATE.PAUSED, slaPausedAt: new Date(), decidedById: user.id, comment },
  });
  await prisma.document.updateMany({
    where: { vendorId, documentType: { departmentKey: review.department.key } },
    data: { status: DOC_STATUS.CHANGES_REQUESTED, reviewNote: comment },
  });
  await prisma.comment.create({ data: { vendorId, departmentId: user.departmentId, authorId: user.id, body: comment, kind: "CLARIFICATION" } });
  await audit(user.id, `REQUEST_CHANGES_${review.department.key}`, vendorId, comment);
  await notifyVendorAccount(vendorId, `${review.department.name} requested changes: ${comment}`);
  await recomputeVendorStatus(vendorId);
  revalidatePath(`/dept/review/${vendorId}`);
  revalidatePath("/dept");
  return { ok: "Change request sent to vendor. SLA paused." };
}

export async function rejectReview(_prev: unknown, formData: FormData) {
  const vendorId = String(formData.get("vendorId") || "");
  const comment = String(formData.get("comment") || "").trim();
  if (!comment) return { error: "A comment is mandatory when rejecting." };
  const { user, review } = await ownReview(vendorId);
  if (review.vendor.status === VSTATUS.HALTED) return { error: "Onboarding is halted by admin." };

  await prisma.deptReview.update({
    where: { id: review.id },
    data: { status: REVIEW_STATUS.REJECTED, slaState: SLA_STATE.MET, decidedById: user.id, comment },
  });
  await prisma.comment.create({ data: { vendorId, departmentId: user.departmentId, authorId: user.id, body: comment, kind: "REJECT" } });
  await audit(user.id, `REJECT_${review.department.key}`, vendorId, comment);
  await notifyVendorAccount(vendorId, `${review.department.name} rejected your submission: ${comment}`);
  await recomputeVendorStatus(vendorId);
  revalidatePath(`/dept/review/${vendorId}`);
  revalidatePath("/dept");
  return { ok: "Rejected." };
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

/** Single dispatcher used by the review screen (one form, multiple buttons). */
export async function reviewAction(prev: unknown, formData: FormData) {
  const intent = String(formData.get("intent") || "");
  switch (intent) {
    case "approve": return approveReview(prev, formData);
    case "changes": return requestChanges(prev, formData);
    case "reject": return rejectReview(prev, formData);
    case "flag": return flagVendor(prev, formData);
    default: return { error: "Unknown action." };
  }
}
