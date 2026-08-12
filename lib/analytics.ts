// Analytics selectors — pure functions over already-fetched Prisma rows.
// The page fetches raw data once (parallelized) and passes it here. Swapping to
// aggregate SQL later means re-implementing these signatures, nothing else.

import type { Vendor, DeptReview, Department, Document, DocumentType, Comment } from "@prisma/client";
import { VSTATUS, REVIEW_STATUS, DOC_STATUS, DEPT_ORDER, DEPT_LABEL, REJECTION_REASON_ORDER, REJECTION_REASON_LABEL } from "./constants";
import { isBreached, daysLeft } from "./sla";
import { inRange } from "./period";

const DAY = 864e5;

export type ReviewWithDept = DeptReview & { department: Department };
export type DocWithType = Document & { documentType: DocumentType };
export type VendorRow = Vendor & {
  deptReviews: ReviewWithDept[];
  documents: DocWithType[];
  comments: Comment[];
};

type Range = { from: Date; to: Date };

// Vendors that are submitted and still moving through review (not terminal).
const ACTIVE_STATUSES: string[] = [
  VSTATUS.SUBMITTED, VSTATUS.IN_REVIEW, VSTATUS.CHANGES_REQUESTED,
  VSTATUS.FLAGGED, VSTATUS.DEPT_APPROVED, VSTATUS.FINAL_PENDING,
];
export const isActivePipeline = (v: Vendor) => ACTIVE_STATUSES.includes(v.status);

function avg(nums: number[]): number | null {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}
function daysBetween(a?: Date | null, b?: Date | null): number | null {
  if (!a || !b) return null;
  return (a.getTime() - b.getTime()) / DAY;
}
function pct(num: number, den: number): number | null {
  return den ? Math.round((num / den) * 100) : null;
}
/** % change of `cur` vs `prev`, or null when there's no baseline. */
function deltaPct(cur: number, prev: number): number | null {
  if (!prev) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

// ---------------------------------------------------------------------------
// Section 1 — Executive Summary
// ---------------------------------------------------------------------------
export type Kpi = { value: number; deltaPct: number | null };

export function computeExecutive(vendors: VendorRow[], period: Range, prev: Range) {
  const onboardedIn = (r: Range) => vendors.filter((v) => v.status === VSTATUS.ONBOARDED && inRange(v.onboardedAt, r.from, r.to));
  const rejectedIn = (r: Range) => vendors.filter((v) => v.status === VSTATUS.REJECTED && inRange(v.updatedAt, r.from, r.to));

  const onNow = onboardedIn(period), onPrev = onboardedIn(prev);
  const rejNow = rejectedIn(period), rejPrev = rejectedIn(prev);

  const valOf = (vs: VendorRow[]) => vs.reduce((s, v) => s + (v.valueAmount ?? 0), 0);
  const avgOnboard = (vs: VendorRow[]) => avg(vs.map((v) => daysBetween(v.onboardedAt, v.submittedAt)).filter((n): n is number => n != null));
  const acceptance = (on: number, rej: number) => (on + rej ? Math.round((on / (on + rej)) * 100) : null);

  // Leading snapshot metrics (current state, not period-scoped).
  const active = vendors.filter(isActivePipeline);
  const pipelineValue = valOf(active);
  const pendingApprovals = vendors
    .filter((v) => v.status !== VSTATUS.HALTED)
    .reduce((s, v) => s + v.deptReviews.filter((r) => r.status === REVIEW_STATUS.PENDING).length, 0);
  const atRisk = vendors.filter((v) =>
    v.status !== VSTATUS.HALTED &&
    v.deptReviews.some((r) => {
      if (r.status !== REVIEW_STATUS.PENDING) return false;
      if (r.everBreached || isBreached(r.slaDueAt, r.slaState)) return true;
      const dl = daysLeft(r.slaDueAt);
      return dl != null && dl <= 2;
    })
  ).length;

  const onAvgNow = avgOnboard(onNow), onAvgPrev = avgOnboard(onPrev);
  const accNow = acceptance(onNow.length, rejNow.length), accPrev = acceptance(onPrev.length, rejPrev.length);

  return {
    // Lagging business (period-over-period)
    onboarded: { value: onNow.length, deltaPct: deltaPct(onNow.length, onPrev.length) } as Kpi,
    onboardedValue: { value: valOf(onNow), deltaPct: deltaPct(valOf(onNow), valOf(onPrev)) } as Kpi,
    avgOnboardDays: { value: onAvgNow ?? 0, deltaPct: onAvgNow != null && onAvgPrev != null ? deltaPct(onAvgNow, onAvgPrev) : null, has: onAvgNow != null },
    acceptanceRate: { value: accNow ?? 0, deltaPct: accNow != null && accPrev != null ? accNow - accPrev : null, has: accNow != null },
    // Leading (current snapshot)
    activePipeline: active.length,
    pipelineValue,
    pendingApprovals,
    atRisk,
  };
}

// ---------------------------------------------------------------------------
// Section 2 — Vendor Pipeline funnel
// ---------------------------------------------------------------------------
export type FunnelStage = { key: string; label: string; count: number; pctOfTop: number; dropoffPct: number | null };

export function computeFunnel(vendors: VendorRow[], period: Range): { stages: FunnelStage[]; rejected: number } {
  // Cohort = vendors invited (created) within the period.
  const cohort = vendors.filter((v) => inRange(v.createdAt, period.from, period.to));
  const reached = {
    invited: cohort.length,
    registered: cohort.filter((v) => v.registeredAt != null || v.status !== VSTATUS.INVITED).length,
    started: cohort.filter((v) => v.onboardingStartedAt != null || v.submittedAt != null).length,
    submitted: cohort.filter((v) => v.submittedAt != null).length,
    inReview: cohort.filter((v) => v.deptReviews.some((r) => r.status !== REVIEW_STATUS.PENDING)).length,
    approved: cohort.filter((v) => v.status === VSTATUS.ONBOARDED).length,
  };
  const top = reached.invited || 1;
  const linear: Array<[string, string, number]> = [
    ["invited", "Invited", reached.invited],
    ["registered", "Registered", reached.registered],
    ["started", "Started onboarding", reached.started],
    ["submitted", "Submitted", reached.submitted],
    ["inReview", "In review", reached.inReview],
    ["approved", "Approved", reached.approved],
  ];
  const stages: FunnelStage[] = linear.map(([key, label, count], i) => ({
    key, label, count,
    pctOfTop: Math.round((count / top) * 100),
    dropoffPct: i === 0 ? null : pct(linear[i - 1][2] - count, linear[i - 1][2]),
  }));
  const rejected = cohort.filter((v) => v.status === VSTATUS.REJECTED).length;
  return { stages, rejected };
}

export function computePipelineHealth(vendors: VendorRow[]) {
  const active = vendors.filter(isActivePipeline);
  const expectedValue = active.reduce((s, v) => s + (v.valueAmount ?? 0), 0);
  // Historical acceptance rate → run-rate projection of how many of the active
  // pipeline are likely to be approved. Transparent heuristic, not a forecast score.
  const settled = vendors.filter((v) => v.status === VSTATUS.ONBOARDED || v.status === VSTATUS.REJECTED);
  const accepted = settled.filter((v) => v.status === VSTATUS.ONBOARDED).length;
  const acceptRate = settled.length ? accepted / settled.length : null;
  const projectedApprovals = acceptRate != null ? Math.round(active.length * acceptRate) : null;
  const atRiskCount = active.filter((v) =>
    v.deptReviews.some((r) => r.status === REVIEW_STATUS.PENDING && (r.everBreached || isBreached(r.slaDueAt, r.slaState)))
  ).length;
  return {
    active: active.length,
    expectedValue,
    acceptRatePct: acceptRate != null ? Math.round(acceptRate * 100) : null,
    projectedApprovals,
    onTrack: active.length - atRiskCount,
    atRisk: atRiskCount,
  };
}

// ---------------------------------------------------------------------------
// Section 3 — Department Bottlenecks
// ---------------------------------------------------------------------------
export type DeptSpeed = { key: string; label: string; avgDays: number | null; slaDays: number; overSla: boolean; decided: number };
export type DeptQueue = { key: string; label: string; pending: number; overSla: number; oldestDays: number | null; avgAgeDays: number | null };

export function computeDeptBottlenecks(vendors: VendorRow[], departments: Department[], period: Range) {
  const allReviews = vendors
    .filter((v) => v.status !== VSTATUS.HALTED)
    .flatMap((v) => v.deptReviews);
  const now = Date.now();

  const speed: DeptSpeed[] = DEPT_ORDER.map((key) => {
    const dept = departments.find((d) => d.key === key);
    const slaDays = dept?.slaDays ?? 5;
    // Decisions *made* in the period (by decidedAt) — recent submissions are
    // mostly still pending, so scoping by decision date is what actually reflects
    // this quarter's throughput.
    const decided = allReviews.filter(
      (r) => r.department.key === key &&
        (r.status === REVIEW_STATUS.APPROVED || r.status === REVIEW_STATUS.REJECTED) &&
        r.decidedAt != null && inRange(r.decidedAt, period.from, period.to)
    );
    const avgDays = avg(decided.map((r) => daysBetween(r.decidedAt, r.slaStartedAt)).filter((n): n is number => n != null && n >= 0));
    return { key, label: DEPT_LABEL[key], avgDays, slaDays, overSla: avgDays != null && avgDays > slaDays, decided: decided.length };
  });

  const queue: DeptQueue[] = DEPT_ORDER.map((key) => {
    const pending = allReviews.filter((r) => r.department.key === key && r.status === REVIEW_STATUS.PENDING);
    const ages = pending.map((r) => (r.slaStartedAt ? Math.max(0, (now - r.slaStartedAt.getTime()) / DAY) : null)).filter((n): n is number => n != null);
    const overSla = pending.filter((r) => r.everBreached || isBreached(r.slaDueAt, r.slaState)).length;
    return {
      key, label: DEPT_LABEL[key],
      pending: pending.length,
      overSla,
      oldestDays: ages.length ? Math.max(...ages) : null,
      avgAgeDays: avg(ages),
    };
  });

  return { speed, queue };
}

// ---------------------------------------------------------------------------
// Section 4 — Vendor Behavior & Quality
// ---------------------------------------------------------------------------
export function computeEngagement(vendors: VendorRow[], mandatoryDocTypeCount: number) {
  const submitted = vendors.filter((v) => v.submittedAt != null);
  const timeToRegister = avg(vendors.map((v) => daysBetween(v.registeredAt, v.createdAt)).filter((n): n is number => n != null && n >= 0));
  const timeToStart = avg(vendors.map((v) => daysBetween(v.onboardingStartedAt, v.registeredAt)).filter((n): n is number => n != null && n >= 0));
  const timeToFirstDoc = avg(submitted.map((v) => {
    const first = v.documents.map((d) => d.uploadedAt).filter((d): d is Date => d != null).sort((a, b) => a.getTime() - b.getTime())[0];
    return daysBetween(first, v.onboardingStartedAt);
  }).filter((n): n is number => n != null && n >= 0));
  const timeToComplete = avg(submitted.map((v) => daysBetween(v.submittedAt, v.onboardingStartedAt)).filter((n): n is number => n != null && n >= 0));

  // Inactivity + completion measured over vendors still in flight (not terminal).
  const active = vendors.filter((v) => v.status !== VSTATUS.ONBOARDED && v.status !== VSTATUS.REJECTED && v.status !== VSTATUS.HALTED && v.status !== VSTATUS.INVITED);
  const now = Date.now();
  const lastActivity = (v: VendorRow): number => {
    const stamps = [
      v.onboardingStartedAt?.getTime(), v.registeredAt?.getTime(), v.submittedAt?.getTime(),
      ...v.documents.map((d) => d.uploadedAt?.getTime()),
      ...v.comments.map((c) => c.createdAt.getTime()),
    ].filter((n): n is number => n != null);
    return stamps.length ? Math.max(...stamps) : v.createdAt.getTime();
  };
  const inactive = active.filter((v) => (now - lastActivity(v)) / DAY > 7).length;

  const completionOf = (v: VendorRow) => {
    if (mandatoryDocTypeCount === 0) return 1;
    const done = new Set(v.documents.filter((d) => d.status !== DOC_STATUS.PENDING).map((d) => d.documentTypeId)).size;
    return Math.min(1, done / mandatoryDocTypeCount);
  };
  const incomplete = active.filter((v) => completionOf(v) < 1).length;

  // Completion distribution across active vendors (0-25 / 25-50 / 50-75 / 75-99 / 100).
  const buckets = [
    { label: "0–25%", count: 0 }, { label: "25–50%", count: 0 }, { label: "50–75%", count: 0 },
    { label: "75–99%", count: 0 }, { label: "100%", count: 0 },
  ];
  for (const v of active) {
    const p = completionOf(v) * 100;
    const idx = p >= 100 ? 4 : p >= 75 ? 3 : p >= 50 ? 2 : p >= 25 ? 1 : 0;
    buckets[idx].count++;
  }

  return {
    timeToRegister, timeToStart, timeToFirstDoc, timeToComplete,
    inactivePct: pct(inactive, active.length),
    incompletePct: pct(incomplete, active.length),
    activeCount: active.length,
    distribution: buckets,
  };
}

export function computeQuality(vendors: VendorRow[], period: Range) {
  const submittedInPeriod = vendors.filter((v) => inRange(v.submittedAt, period.from, period.to));

  // Change-request rate: share of submitted vendors that hit at least one
  // rejection / change-request on any document.
  const withRework = submittedInPeriod.filter((v) =>
    v.documents.some((d) => d.status === DOC_STATUS.REJECTED || d.status === DOC_STATUS.CHANGES_REQUESTED || (d.rejectionReason != null))
  ).length;
  const changeRequestRate = pct(withRework, submittedInPeriod.length);

  const avgRevisions = avg(submittedInPeriod.map((v) => v.documents.reduce((s, d) => s + (d.revisionCount ?? 0), 0)));

  // Most-rejected document type (by REJECTED + CHANGES_REQUESTED count).
  const docCounts = new Map<string, number>();
  for (const v of vendors) {
    for (const d of v.documents) {
      if (d.status === DOC_STATUS.REJECTED || d.status === DOC_STATUS.CHANGES_REQUESTED) {
        docCounts.set(d.documentType.name, (docCounts.get(d.documentType.name) ?? 0) + 1);
      }
    }
  }
  const mostRejected = [...docCounts.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;

  // Rejection reasons (categorized) across all documents carrying a reason.
  const reasonCounts = new Map<string, number>();
  for (const v of vendors) {
    for (const d of v.documents) {
      if (d.rejectionReason) reasonCounts.set(d.rejectionReason, (reasonCounts.get(d.rejectionReason) ?? 0) + 1);
    }
  }
  const reasons = REJECTION_REASON_ORDER
    .map((r) => ({ key: r, label: REJECTION_REASON_LABEL[r], count: reasonCounts.get(r) ?? 0 }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);

  return {
    changeRequestRate,
    avgRevisions,
    mostRejected: mostRejected ? { name: mostRejected[0], count: mostRejected[1] } : null,
    reasons,
  };
}

// ---------------------------------------------------------------------------
// Section 5 — Trends
// ---------------------------------------------------------------------------
export type TrendPoint = { month: string; label: string; onboarded: number; avgDays: number | null };

export function computeTrends(vendors: VendorRow[], months = 12): TrendPoint[] {
  const out: TrendPoint[] = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
    const inMonth = vendors.filter((v) => v.status === VSTATUS.ONBOARDED && v.onboardedAt &&
      v.onboardedAt.getFullYear() === d.getFullYear() && v.onboardedAt.getMonth() === d.getMonth());
    const avgDays = avg(inMonth.map((v) => daysBetween(v.onboardedAt, v.submittedAt)).filter((n): n is number => n != null));
    out.push({ month: key, label, onboarded: inMonth.length, avgDays });
  }
  return out;
}

/**
 * Where time is spent. Vendor preparation is sequential; the four department
 * reviews run in PARALLEL (all SLA clocks start at submit), so they are NOT
 * summed — we report each department's average duration plus the critical-path
 * (max) review time, which is what actually gates onboarding.
 */
export function computeStageTime(vendors: VendorRow[], departments: Department[]) {
  const onboarded = vendors.filter((v) => v.status === VSTATUS.ONBOARDED);
  const prep = avg(onboarded.map((v) => daysBetween(v.submittedAt, v.onboardingStartedAt)).filter((n): n is number => n != null && n >= 0));

  const perDept = DEPT_ORDER.map((key) => {
    const durations = onboarded.flatMap((v) =>
      v.deptReviews.filter((r) => r.department.key === key && r.decidedAt != null)
        .map((r) => daysBetween(r.decidedAt, r.slaStartedAt))
        .filter((n): n is number => n != null && n >= 0)
    );
    return { key, label: DEPT_LABEL[key], avgDays: avg(durations) };
  });

  // Critical path = average of each vendor's slowest department review.
  const criticalPath = avg(onboarded.map((v) => {
    const durs = v.deptReviews.map((r) => daysBetween(r.decidedAt, r.slaStartedAt)).filter((n): n is number => n != null && n >= 0);
    return durs.length ? Math.max(...durs) : null;
  }).filter((n): n is number => n != null));

  return { prep, perDept, criticalPath };
}
