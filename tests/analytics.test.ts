import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeExecutive,
  computeFunnel,
  computeQuality,
  type ReviewWithDept,
  type VendorRow,
} from "@/lib/analytics";
import { previousPeriod, quarterRange } from "@/lib/period";

// Fixed clock so snapshot-style analytics (at-risk, breach checks) are stable.
const NOW = new Date(2026, 5, 15, 12); // 2026-06-15, mid-Q2
const PERIOD = quarterRange(2026, 2); // Apr 1 – Jun 30 2026
const PREV = previousPeriod(PERIOD);

beforeEach(() => vi.setSystemTime(NOW));
afterEach(() => vi.useRealTimers());

function review(partial: Partial<ReviewWithDept> & { key: string }): ReviewWithDept {
  const { key, ...rest } = partial;
  return {
    status: "PENDING",
    slaStartedAt: null,
    slaDueAt: null,
    slaState: "PENDING",
    everBreached: false,
    decidedAt: null,
    department: { key } as ReviewWithDept["department"],
    ...rest,
  } as ReviewWithDept;
}

function vendor(partial: Partial<VendorRow>): VendorRow {
  return {
    id: "v",
    name: "Vendor",
    status: "INVITED",
    valueAmount: null,
    createdAt: NOW,
    updatedAt: NOW,
    registeredAt: null,
    onboardingStartedAt: null,
    submittedAt: null,
    onboardedAt: null,
    deptReviews: [],
    documents: [],
    comments: [],
    ...partial,
  } as unknown as VendorRow;
}

// Coherent 4-vendor Q2 cohort: one onboarded, one rejected, one in-review
// (with a breached pending review), one still just invited.
function dataset(): VendorRow[] {
  const v1 = vendor({
    id: "v1",
    status: "ONBOARDED",
    valueAmount: 100000,
    createdAt: new Date(2026, 3, 2),
    registeredAt: new Date(2026, 3, 3),
    onboardingStartedAt: new Date(2026, 3, 4),
    submittedAt: new Date(2026, 3, 20),
    onboardedAt: new Date(2026, 4, 1), // May 1 → 11 days after submit
    updatedAt: new Date(2026, 4, 1),
    deptReviews: [
      review({ key: "FINANCE", status: "APPROVED", slaStartedAt: new Date(2026, 3, 21), decidedAt: new Date(2026, 3, 28) }),
      review({ key: "LEGAL", status: "APPROVED", slaStartedAt: new Date(2026, 3, 21), decidedAt: new Date(2026, 3, 30) }),
    ],
  });
  const v2 = vendor({
    id: "v2",
    status: "REJECTED",
    valueAmount: 20000,
    createdAt: new Date(2026, 3, 5),
    registeredAt: new Date(2026, 3, 6),
    onboardingStartedAt: new Date(2026, 3, 7),
    submittedAt: new Date(2026, 3, 15),
    updatedAt: new Date(2026, 4, 5),
    deptReviews: [review({ key: "FINANCE", status: "REJECTED", slaStartedAt: new Date(2026, 3, 16), decidedAt: new Date(2026, 3, 25) })],
    documents: [
      {
        status: "REJECTED",
        rejectionReason: "INCOMPLETE",
        revisionCount: 1,
        uploadedAt: new Date(2026, 3, 16),
        documentTypeId: "dt-pan",
        documentType: { name: "PAN" },
      } as unknown as VendorRow["documents"][number],
    ],
  });
  const v3 = vendor({
    id: "v3",
    status: "IN_REVIEW",
    valueAmount: 50000,
    createdAt: new Date(2026, 3, 10),
    registeredAt: new Date(2026, 3, 11),
    onboardingStartedAt: new Date(2026, 3, 12),
    submittedAt: new Date(2026, 4, 20),
    deptReviews: [
      review({ key: "FINANCE", status: "PENDING", slaStartedAt: new Date(2026, 4, 21), slaDueAt: new Date(2026, 5, 1), slaState: "RUNNING" }),
    ],
  });
  const v4 = vendor({ id: "v4", status: "INVITED", createdAt: new Date(2026, 3, 12) });
  return [v1, v2, v3, v4];
}

describe("computeExecutive", () => {
  it("computes lagging and leading KPIs from the cohort", () => {
    const e = computeExecutive(dataset(), PERIOD, PREV);
    expect(e.onboarded.value).toBe(1);
    expect(e.onboardedValue.value).toBe(100000);
    expect(e.avgOnboardDays.value).toBe(11);
    expect(e.avgOnboardDays.has).toBe(true);
    expect(e.acceptanceRate.value).toBe(50); // 1 onboarded / (1 + 1 rejected)
    expect(e.activePipeline).toBe(1); // only v3
    expect(e.pipelineValue).toBe(50000);
    expect(e.pendingApprovals).toBe(1);
    expect(e.atRisk).toBe(1); // v3's pending review is past due
  });
});

describe("computeFunnel", () => {
  it("steps down the invited→approved cohort", () => {
    const { stages, rejected } = computeFunnel(dataset(), PERIOD);
    expect(stages.map((s) => s.count)).toEqual([4, 3, 3, 3, 2, 1]);
    expect(rejected).toBe(1);
    expect(stages[0].dropoffPct).toBeNull();
  });
});

describe("computeQuality", () => {
  it("summarizes rework rate, reasons, and most-rejected doc", () => {
    const q = computeQuality(dataset(), PERIOD);
    expect(q.changeRequestRate).toBe(33); // 1 of 3 submitted had rework
    expect(q.reasons).toHaveLength(1);
    expect(q.reasons[0].key).toBe("INCOMPLETE");
    expect(q.mostRejected).toEqual({ name: "PAN", count: 1 });
  });
});
