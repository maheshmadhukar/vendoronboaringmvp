import { prisma } from "./prisma";
import { VSTATUS, REVIEW_STATUS, SLA_STATE, DOC_STATUS, ROLE } from "./constants";
import { computeDueAt, isBreached } from "./sla";
import { getBuyerCoveredKeys } from "./vendor";

export async function getConfig() {
  let cfg = await prisma.config.findUnique({ where: { id: 1 } });
  if (!cfg) cfg = await prisma.config.create({ data: { id: 1 } });
  return cfg;
}

export async function notify(
  userId: string,
  message: string,
  kind = "INFO",
  vendorId?: string
) {
  await prisma.notification.create({
    data: { userId, message, kind, vendorId: vendorId ?? null },
  });
}

/** Notify every active user in a department (managers + members). */
export async function notifyDept(
  departmentId: string,
  message: string,
  vendorId?: string
) {
  const users = await prisma.user.findMany({
    where: { departmentId, active: true },
  });
  await Promise.all(users.map((u) => notify(u.id, message, "TASK", vendorId)));
}

export async function notifyAdmins(message: string, vendorId?: string) {
  const admins = await prisma.user.findMany({
    where: { role: ROLE.ADMIN, active: true },
  });
  await Promise.all(admins.map((a) => notify(a.id, message, "AUDIT", vendorId)));
}

export async function audit(
  actorId: string | null,
  action: string,
  targetId?: string,
  meta?: string
) {
  await prisma.auditLog.create({
    data: { actorId, action, targetType: "VENDOR", targetId, meta },
  });
}

/** On submit: spawn a PENDING DeptReview per department with SLA clocks. */
export async function createDeptReviews(vendorId: string, submittedAt: Date) {
  const cfg = await getConfig();
  const depts = await prisma.department.findMany();
  await Promise.all(
    depts.map((dept) => {
      const { start, due } = computeDueAt(submittedAt, dept.slaDays, cfg.cutoffHour);
      return prisma.deptReview.upsert({
        where: { vendorId_departmentId: { vendorId, departmentId: dept.id } },
        create: {
          vendorId,
          departmentId: dept.id,
          status: REVIEW_STATUS.PENDING,
          slaStartedAt: start,
          slaDueAt: due,
          slaState: SLA_STATE.RUNNING,
        },
        update: {
          status: REVIEW_STATUS.PENDING,
          slaStartedAt: start,
          slaDueAt: due,
          slaState: SLA_STATE.RUNNING,
          decidedById: null,
          comment: null,
          pausedMs: 0,
          slaPausedAt: null,
        },
      });
    })
  );
}

/**
 * Recompute a department's review status from the statuses of the
 * documents routed to it. Decisions are made per document; this rolls
 * them up into the single DeptReview record that drives the vendor's
 * overall status and the SLA clock.
 */
export async function recomputeDeptReviewStatus(vendorId: string, departmentId: string) {
  const review = await prisma.deptReview.findUnique({
    where: { vendorId_departmentId: { vendorId, departmentId } },
    include: { department: true },
  });
  if (!review) return;

  const allDocs = await prisma.document.findMany({
    where: { vendorId, documentType: { departmentKey: review.department.key } },
    include: { documentType: true },
  });
  // A document the buyer already provided (e.g. their own MSA/NDA) isn't something
  // the vendor was asked to submit, so it shouldn't block this department's rollup.
  const coveredKeys = await getBuyerCoveredKeys(vendorId);
  const docs = allDocs.filter((d) => !coveredKeys.has(d.documentType.key));
  if (docs.length === 0) return;

  const anyRejected = docs.some((d) => d.status === DOC_STATUS.REJECTED);
  const anyChanges = docs.some((d) => d.status === DOC_STATUS.CHANGES_REQUESTED);
  const allApproved = docs.every((d) => d.status === DOC_STATUS.APPROVED);

  let next = review.status;
  if (anyRejected) next = REVIEW_STATUS.REJECTED;
  else if (anyChanges) next = REVIEW_STATUS.CHANGES_REQUESTED;
  else if (allApproved) next = REVIEW_STATUS.APPROVED;
  else next = REVIEW_STATUS.PENDING;

  const data: { status: string; slaState?: string; slaPausedAt?: Date | null; everBreached?: boolean } = { status: next };
  const terminal = next === REVIEW_STATUS.REJECTED || next === REVIEW_STATUS.APPROVED;
  if (terminal && review.slaState !== SLA_STATE.MET) {
    data.slaState = SLA_STATE.MET;
  } else if (next === REVIEW_STATUS.CHANGES_REQUESTED && review.slaState !== SLA_STATE.PAUSED) {
    data.slaState = SLA_STATE.PAUSED;
    data.slaPausedAt = new Date();
  }
  // Sticky: once a review has missed its due date, remember that even after it resolves.
  if (!review.everBreached && isBreached(review.slaDueAt, review.slaState)) {
    data.everBreached = true;
  }

  await prisma.deptReview.update({ where: { id: review.id }, data });
  await recomputeVendorStatus(vendorId);
}

/**
 * Recompute overall vendor status from its department reviews.
 * Terminal/admin-managed states (HALTED, REJECTED, ONBOARDED) are left alone.
 */
export async function recomputeVendorStatus(vendorId: string) {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    include: { deptReviews: true },
  });
  if (!vendor) return;
  if (
    vendor.status === VSTATUS.HALTED ||
    vendor.status === VSTATUS.REJECTED ||
    vendor.status === VSTATUS.ONBOARDED
  ) {
    return;
  }
  const reviews = vendor.deptReviews;
  if (reviews.length === 0) return;

  const anyFlagged = reviews.some((r) => r.status === REVIEW_STATUS.FLAGGED);
  const anyRejected = reviews.some((r) => r.status === REVIEW_STATUS.REJECTED);
  const anyChanges = reviews.some(
    (r) => r.status === REVIEW_STATUS.CHANGES_REQUESTED
  );
  const allApproved = reviews.every((r) => r.status === REVIEW_STATUS.APPROVED);

  let next = vendor.status;
  if (anyFlagged) next = VSTATUS.FLAGGED;
  else if (anyRejected) next = VSTATUS.REJECTED;
  else if (anyChanges) next = VSTATUS.CHANGES_REQUESTED;
  else if (allApproved) {
    const cfg = await getConfig();
    next = cfg.finalApprovalRequired ? VSTATUS.FINAL_PENDING : VSTATUS.ONBOARDED;
  } else next = VSTATUS.IN_REVIEW;

  const data: { status: string; onboardedAt?: Date } = { status: next };
  if (next === VSTATUS.ONBOARDED && !vendor.onboardedAt)
    data.onboardedAt = new Date();

  await prisma.vendor.update({ where: { id: vendorId }, data });

  // Notify vendor account on status change (in-app), if configured.
  const cfg = await getConfig();
  if (cfg.notifyVendorOnStatus && next !== vendor.status) {
    const account = await prisma.user.findFirst({ where: { vendorId } });
    if (account)
      await notify(
        account.id,
        `Your onboarding status changed to "${next.replace(/_/g, " ").toLowerCase()}".`,
        "STATUS",
        vendorId
      );
  }
  return next;
}

/** Overall pipeline stage index (0-4) for the status bar. */
export function pipelineStage(status: string): number {
  switch (status) {
    case VSTATUS.INVITED:
    case VSTATUS.DRAFT:
      return 0;
    case VSTATUS.SUBMITTED:
      return 1;
    case VSTATUS.IN_REVIEW:
    case VSTATUS.CHANGES_REQUESTED:
    case VSTATUS.FLAGGED:
    case VSTATUS.HALTED:
      return 2;
    case VSTATUS.DEPT_APPROVED:
    case VSTATUS.FINAL_PENDING:
      return 3;
    case VSTATUS.ONBOARDED:
      return 4;
    default:
      return 2;
  }
}
