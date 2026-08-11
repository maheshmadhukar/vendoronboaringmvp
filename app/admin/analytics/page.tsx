import Link from "next/link";
import Shell from "@/app/components/Shell";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/workflow";
import { DEPT_LABEL, DEPT_ORDER, VSTATUS, REVIEW_STATUS, DOC_STATUS } from "@/lib/constants";
import { fmtMoney } from "@/lib/format";
import { isBreached } from "@/lib/sla";
import { resolvePeriod, inRange, type PeriodMode } from "@/lib/period";

const DAY = 864e5;
function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}
function days(a?: Date | null, b?: Date | null): number | null {
  if (!a || !b) return null;
  return (a.getTime() - b.getTime()) / DAY;
}
function pct(num: number, den: number): number | null {
  return den ? Math.round((num / den) * 100) : null;
}

type SearchParams = { mode?: string; y?: string; q?: string; from?: string; to?: string };

export default async function Analytics({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin();
  const sp = await searchParams;
  const period = resolvePeriod(sp);
  const { from, to } = period;

  const [, vendors, depts, documents] = await Promise.all([
    getConfig(),
    prisma.vendor.findMany({
      include: { deptReviews: { include: { department: true } }, comments: true },
    }),
    prisma.department.findMany(),
    prisma.document.findMany({ include: { documentType: true } }),
  ]);
  const deptById = new Map(depts.map((d) => [d.id, d]));
  const docTypeById = new Map(documents.map((d) => [d.id, d.documentType]));

  const allOnboarded = vendors.filter((v) => v.status === VSTATUS.ONBOARDED);
  const onboarded = allOnboarded.filter((v) => inRange(v.onboardedAt, from, to));
  const rejected = vendors.filter((v) => v.status === VSTATUS.REJECTED && inRange(v.updatedAt, from, to));
  const submittedInPeriod = vendors.filter((v) => inRange(v.submittedAt, from, to));

  const totalValue = onboarded.reduce((s, v) => s + (v.valueAmount ?? 0), 0);

  const onboardDurations = onboarded.map((v) => days(v.onboardedAt, v.submittedAt)).filter((n): n is number => n != null);
  const avgOnboardDays = avg(onboardDurations);

  const submitDurations = submittedInPeriod.map((v) => days(v.submittedAt, v.createdAt)).filter((n): n is number => n != null);
  const avgSubmitDays = avg(submitDurations);

  const acceptTotal = onboarded.length + rejected.length;
  const acceptRate = acceptTotal ? Math.round((onboarded.length / acceptTotal) * 100) : null;

  // resubmit turnaround: CLARIFICATION -> next RESUBMIT, where the resubmit landed in-period.
  // Also bucketed by the department that asked for the change, for the per-dept breakdown below.
  const resubmitGaps: number[] = [];
  const resubmitGapsByDept = new Map<string, number[]>();
  for (const v of vendors) {
    const cs = [...v.comments].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    for (let i = 0; i < cs.length; i++) {
      if (cs[i].kind === "CLARIFICATION") {
        const next = cs.slice(i + 1).find((c) => c.kind === "RESUBMIT");
        if (next && inRange(next.createdAt, from, to)) {
          const gap = days(next.createdAt, cs[i].createdAt)!;
          resubmitGaps.push(gap);
          const deptId = cs[i].departmentId;
          if (deptId) {
            if (!resubmitGapsByDept.has(deptId)) resubmitGapsByDept.set(deptId, []);
            resubmitGapsByDept.get(deptId)!.push(gap);
          }
        }
      }
    }
  }
  const avgResubmit = avg(resubmitGaps);
  const resubmitByDept = depts
    .map((d) => ({ name: DEPT_LABEL[d.key] ?? d.name, gaps: resubmitGapsByDept.get(d.id) ?? [] }))
    .filter((d) => d.gaps.length > 0)
    .map((d) => ({ name: d.name, avgDays: avg(d.gaps)!, count: d.gaps.length }))
    .sort((a, b) => b.avgDays - a.avgDays);

  // dept-wise: period-scoped speed/breach/reject figures, plus an all-time historical breach rate
  // (deliberately NOT period-scoped — it's the lagging, "has this department ever missed a deadline" number).
  const deptStats = DEPT_ORDER.map((k) => {
    const d = depts.find((x) => x.key === k)!;
    const allReviews = vendors.flatMap((v) => v.deptReviews.filter((r) => r.department.key === k));
    const reviews = allReviews.filter((r) => inRange(r.slaStartedAt, from, to));
    const decided = reviews.filter((r) => r.status === REVIEW_STATUS.APPROVED || r.status === REVIEW_STATUS.REJECTED);
    const spd = avg(decided.map((r) => days(r.updatedAt, r.slaStartedAt)).filter((n): n is number => n != null));
    const breaches = reviews.filter((r) => r.everBreached || isBreached(r.slaDueAt, r.slaState)).length;
    const rejectedDecided = decided.filter((r) => r.status === REVIEW_STATUS.REJECTED).length;
    const allTimeBreached = allReviews.filter((r) => r.everBreached || isBreached(r.slaDueAt, r.slaState)).length;
    return {
      key: k, sla: d.slaDays, speed: spd, breaches, decided: decided.length,
      rejectRate: pct(rejectedDecided, decided.length),
      allTimeBreachRate: pct(allTimeBreached, allReviews.length),
      allTimeTotal: allReviews.length,
    };
  });
  const maxScale = Math.max(...deptStats.map((s) => Math.max(s.sla, s.speed ?? 0)), 6);

  // document-level friction: how often each document type gets rejected or sent back, in-period
  const docStatsMap = new Map<string, { name: string; deptKey: string; total: number; rejected: number; changes: number }>();
  for (const doc of documents) {
    const key = doc.documentTypeId;
    if (!docStatsMap.has(key)) {
      docStatsMap.set(key, { name: doc.documentType.name, deptKey: doc.documentType.departmentKey, total: 0, rejected: 0, changes: 0 });
    }
    if (doc.status !== DOC_STATUS.PENDING) docStatsMap.get(key)!.total++;
  }
  for (const v of vendors) {
    for (const c of v.comments) {
      if (!c.documentId || !inRange(c.createdAt, from, to)) continue;
      const dt = docTypeById.get(c.documentId);
      if (!dt) continue;
      const s = docStatsMap.get(dt.id);
      if (!s) continue;
      if (c.kind === "REJECT") s.rejected++;
      else if (c.kind === "CLARIFICATION") s.changes++;
    }
  }
  const docFriction = [...docStatsMap.values()]
    .map((s) => ({ ...s, reworkRate: pct(s.rejected + s.changes, s.total) }))
    .filter((s) => s.rejected + s.changes > 0)
    .sort((a, b) => (b.reworkRate ?? 0) - (a.reworkRate ?? 0));

  // vendor funnel: cohort of vendors created (invited) within the selected period
  const cohort = vendors.filter((v) => inRange(v.createdAt, from, to));
  const funnelInvited = cohort.length;
  const funnelSubmitted = cohort.filter((v) => v.submittedAt).length;
  const funnelOnboarded = cohort.filter((v) => v.status === VSTATUS.ONBOARDED).length;
  const funnelRejected = cohort.filter((v) => v.status === VSTATUS.REJECTED).length;

  const modeHref = (mode: PeriodMode) => {
    if (mode === "quarter") return "?mode=quarter";
    if (mode === "year") return "?mode=year";
    return `?mode=custom&from=${period.fromInput}&to=${period.toInput}`;
  };

  return (
    <Shell active="analytics" title="Analytics">
      <div className="page-head">
        <div><h1>Analytics</h1><p>Directional metrics across the onboarding pipeline. (Prototype — figures reflect seeded data.)</p></div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 6 }}>
            <Link className={`btn sm ${period.mode === "quarter" ? "primary" : "ghost"}`} href={modeHref("quarter")}>Quarter</Link>
            <Link className={`btn sm ${period.mode === "year" ? "primary" : "ghost"}`} href={modeHref("year")}>Year</Link>
            <Link className={`btn sm ${period.mode === "custom" ? "primary" : "ghost"}`} href={modeHref("custom")}>Custom</Link>
          </div>

          {period.mode !== "custom" ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Link className="btn sm ghost" href={period.prevHref} aria-label="Previous period">‹</Link>
              <div style={{ fontSize: 13.5, fontWeight: 650, minWidth: 90, textAlign: "center" }}>{period.label}</div>
              <Link className="btn sm ghost" href={period.nextHref} aria-label="Next period">›</Link>
            </div>
          ) : (
            <form method="GET" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="hidden" name="mode" value="custom" />
              <input type="date" name="from" defaultValue={period.fromInput} className="tnum" style={{ fontSize: 13, padding: "6px 8px", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-sm)", background: "var(--panel)", color: "var(--ink)" }} />
              <span className="sub">to</span>
              <input type="date" name="to" defaultValue={period.toInput} className="tnum" style={{ fontSize: 13, padding: "6px 8px", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-sm)", background: "var(--panel)", color: "var(--ink)" }} />
              <button className="btn sm primary" type="submit">Apply</button>
            </form>
          )}

          <span className="sub" style={{ marginLeft: "auto" }}>{period.rangeLabel}</span>
        </div>
      </div>

      <div className="grid-4" style={{ marginBottom: 18 }}>
        <div className="stat"><div className="label">Onboarded ({period.label})</div><div className="value">{onboarded.length}</div><div className="delta">{allOnboarded.length} all-time</div></div>
        <div className="stat"><div className="label">Onboarded value ({period.label})</div><div className="value">{fmtMoney(totalValue)}</div></div>
        <div className="stat"><div className="label">Avg onboarding time</div><div className="value">{avgOnboardDays != null ? avgOnboardDays.toFixed(1) : "—"}</div><div className="delta">days (submit → onboard)</div></div>
        <div className="stat"><div className="label">Acceptance rate</div><div className="value">{acceptRate != null ? acceptRate + "%" : "—"}</div><div className="delta">{onboarded.length} accepted · {rejected.length} rejected</div></div>
      </div>

      <div className="grid-3" style={{ marginBottom: 18 }}>
        <div className="stat"><div className="label">Avg vendor time to submit all docs</div><div className="value">{avgSubmitDays != null ? avgSubmitDays.toFixed(1) : "—"}</div><div className="delta">days</div></div>
        <div className="stat"><div className="label">Avg vendor resubmit turnaround</div><div className="value">{avgResubmit != null ? avgResubmit.toFixed(1) : "—"}</div><div className="delta">days after a change request</div></div>
        <div className="stat"><div className="label">SLA breaches</div><div className="value">{deptStats.reduce((s, d) => s + d.breaches, 0)}</div><div className="delta">reviews started in {period.label}</div></div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 18 }}>
        <div className="section-label">Vendor funnel — cohort invited in {period.label}</div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Stage</th><th>Count</th><th>Conversion</th></tr></thead>
            <tbody>
              <tr><td className="strong">Invited</td><td className="tnum">{funnelInvited}</td><td className="tnum">—</td></tr>
              <tr><td className="strong">Submitted</td><td className="tnum">{funnelSubmitted}</td><td className="tnum">{pct(funnelSubmitted, funnelInvited) ?? "—"}{funnelInvited ? "%" : ""} of invited</td></tr>
              <tr><td className="strong">Onboarded</td><td className="tnum">{funnelOnboarded}</td><td className="tnum">{pct(funnelOnboarded, funnelSubmitted) ?? "—"}{funnelSubmitted ? "%" : ""} of submitted</td></tr>
              <tr><td className="strong">Rejected</td><td className="tnum" style={{ color: funnelRejected ? "var(--bad)" : undefined }}>{funnelRejected}</td><td className="tnum">{pct(funnelRejected, funnelSubmitted) ?? "—"}{funnelSubmitted ? "%" : ""} of submitted</td></tr>
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: 11.5, marginTop: 12 }}>
          Cohort = vendors invited within {period.label}; some may still be in progress and not yet reflected in Onboarded/Rejected.
        </p>
      </div>

      <div className="card card-pad" style={{ marginBottom: 18 }}>
        <div className="section-label">Department speed, rejection &amp; SLA</div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Department</th><th>Avg decision (days)</th><th style={{ width: "26%" }}>Speed vs SLA</th><th>SLA</th><th>Breaches</th><th>Reject rate</th><th>All-time breach rate</th></tr></thead>
            <tbody>
              {deptStats.map((s) => (
                <tr key={s.key}>
                  <td className="strong">{DEPT_LABEL[s.key]}</td>
                  <td className="tnum">{s.speed != null ? s.speed.toFixed(1) : "—"}</td>
                  <td>
                    <div className="bar-track">
                      <div className="bar-fill" style={{
                        width: `${Math.min(100, ((s.speed ?? 0) / maxScale) * 100)}%`,
                        background: s.speed != null && s.speed > s.sla ? "var(--bad)" : "var(--accent)",
                      }} />
                    </div>
                  </td>
                  <td className="tnum">{s.sla}d</td>
                  <td className="tnum" style={{ color: s.breaches ? "var(--bad)" : undefined }}>{s.breaches}</td>
                  <td className="tnum">{s.rejectRate != null ? s.rejectRate + "%" : "—"}</td>
                  <td className="tnum" style={{ color: s.allTimeBreachRate ? "var(--bad)" : undefined }}>
                    {s.allTimeBreachRate != null ? `${s.allTimeBreachRate}%` : "—"}
                    {s.allTimeTotal ? <span className="sub"> ({s.allTimeTotal} reviews)</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: 11.5, marginTop: 12 }}>
          Speed, breaches, and reject rate reflect reviews started within {period.label}. All-time breach rate is historical and ignores the period filter — it&apos;s the share of every review this department has ever run past its deadline, even ones that later resolved on time.
        </p>
      </div>

      {resubmitByDept.length > 0 ? (
        <div className="card card-pad" style={{ marginBottom: 18 }}>
          <div className="section-label">Vendor resubmit turnaround by department</div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Department</th><th>Avg turnaround (days)</th><th>Resubmissions</th></tr></thead>
              <tbody>
                {resubmitByDept.map((d) => (
                  <tr key={d.name}>
                    <td className="strong">{d.name}</td>
                    <td className="tnum">{d.avgDays.toFixed(1)}</td>
                    <td className="tnum">{d.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ fontSize: 11.5, marginTop: 12 }}>
            How long vendors take to resubmit after each department&apos;s change request, in {period.label}. Slower rows are where vendors get stuck responding, not where the department is slow to review.
          </p>
        </div>
      ) : null}

      {docFriction.length > 0 ? (
        <div className="card card-pad">
          <div className="section-label">Document friction — rework by document type</div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Document</th><th>Routed to</th><th>Rejected</th><th>Changes requested</th><th>Rework rate</th></tr></thead>
              <tbody>
                {docFriction.map((s) => (
                  <tr key={s.name}>
                    <td className="strong">{s.name}</td>
                    <td>{DEPT_LABEL[s.deptKey] ?? s.deptKey}</td>
                    <td className="tnum" style={{ color: s.rejected ? "var(--bad)" : undefined }}>{s.rejected}</td>
                    <td className="tnum" style={{ color: s.changes ? "var(--warn)" : undefined }}>{s.changes}</td>
                    <td className="tnum">{s.reworkRate != null ? s.reworkRate + "%" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ fontSize: 11.5, marginTop: 12 }}>
            Rejections and change requests in {period.label}, against the total number of that document type ever submitted (not period-limited) — pinpoints which document actually causes the back-and-forth, not just which department.
          </p>
        </div>
      ) : null}
    </Shell>
  );
}
