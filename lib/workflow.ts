import { prisma } from "./prisma";
import { VSTATUS, REVIEW_STATUS, SLA_STATE, ROLE } from "./constants";
import { computeDueAt } from "./sla";

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
  for (const dept of depts) {
    const { start, due } = computeDueAt(submittedAt, dept.slaDays, cfg.cutoffHour);
    await prisma.deptReview.upsert({
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
  }
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
