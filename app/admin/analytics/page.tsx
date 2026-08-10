import Shell from "@/app/components/Shell";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/workflow";
import { DEPT_LABEL, DEPT_ORDER, VSTATUS, REVIEW_STATUS } from "@/lib/constants";
import { fmtMoney } from "@/lib/format";
import { isBreached } from "@/lib/sla";

const DAY = 864e5;
function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}
function days(a?: Date | null, b?: Date | null): number | null {
  if (!a || !b) return null;
  return (a.getTime() - b.getTime()) / DAY;
}

export default async function Analytics() {
  await requireAdmin();
  await getConfig();
  const vendors = await prisma.vendor.findMany({
    include: { deptReviews: { include: { department: true } }, comments: true },
  });
  const depts = await prisma.department.findMany();

  const onboarded = vendors.filter((v) => v.status === VSTATUS.ONBOARDED);
  const rejected = vendors.filter((v) => v.status === VSTATUS.REJECTED);
  const now = Date.now();
  const last30 = onboarded.filter((v) => v.onboardedAt && now - v.onboardedAt.getTime() <= 30 * DAY);
  const totalValue = onboarded.reduce((s, v) => s + (v.valueAmount ?? 0), 0);

  const onboardDurations = onboarded.map((v) => days(v.onboardedAt, v.submittedAt)).filter((n): n is number => n != null);
  const avgOnboardDays = avg(onboardDurations);

  const submitDurations = vendors.filter((v) => v.submittedAt).map((v) => days(v.submittedAt, v.createdAt)).filter((n): n is number => n != null);
  const avgSubmitDays = avg(submitDurations);

  const acceptTotal = onboarded.length + rejected.length;
  const acceptRate = acceptTotal ? Math.round((onboarded.length / acceptTotal) * 100) : null;

  // resubmit turnaround: CLARIFICATION -> next RESUBMIT
  const resubmitGaps: number[] = [];
  for (const v of vendors) {
    const cs = [...v.comments].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    for (let i = 0; i < cs.length; i++) {
      if (cs[i].kind === "CLARIFICATION") {
        const next = cs.slice(i + 1).find((c) => c.kind === "RESUBMIT");
        if (next) resubmitGaps.push(days(next.createdAt, cs[i].createdAt)!);
      }
    }
  }
  const avgResubmit = avg(resubmitGaps);

  // dept-wise
  const deptStats = DEPT_ORDER.map((k) => {
    const d = depts.find((x) => x.key === k)!;
    const reviews = vendors.flatMap((v) => v.deptReviews.filter((r) => r.department.key === k));
    const decided = reviews.filter((r) => r.status === REVIEW_STATUS.APPROVED || r.status === REVIEW_STATUS.REJECTED);
    const spd = avg(decided.map((r) => days(r.updatedAt, r.slaStartedAt)).filter((n): n is number => n != null));
    const breaches = reviews.filter((r) => isBreached(r.slaDueAt, r.slaState)).length;
    return { key: k, sla: d.slaDays, speed: spd, breaches, decided: decided.length };
  });
  const maxScale = Math.max(...deptStats.map((s) => Math.max(s.sla, s.speed ?? 0)), 6);

  return (
    <Shell active="analytics" title="Analytics">
      <div className="page-head">
        <div><h1>Analytics</h1><p>Directional metrics across the onboarding pipeline. (Prototype — figures reflect seeded data.)</p></div>
      </div>

      <div className="grid-4" style={{ marginBottom: 18 }}>
        <div className="stat"><div className="label">Onboarded (last 30 days)</div><div className="value">{last30.length}</div><div className="delta">{onboarded.length} all-time</div></div>
        <div className="stat"><div className="label">Overall onboarded value</div><div className="value">{fmtMoney(totalValue)}</div></div>
        <div className="stat"><div className="label">Avg onboarding time</div><div className="value">{avgOnboardDays != null ? avgOnboardDays.toFixed(1) : "—"}</div><div className="delta">days (submit → onboard)</div></div>
        <div className="stat"><div className="label">Acceptance rate</div><div className="value">{acceptRate != null ? acceptRate + "%" : "—"}</div><div className="delta">{onboarded.length} accepted · {rejected.length} rejected</div></div>
      </div>

      <div className="grid-3" style={{ marginBottom: 18 }}>
        <div className="stat"><div className="label">Avg vendor time to submit all docs</div><div className="value">{avgSubmitDays != null ? avgSubmitDays.toFixed(1) : "—"}</div><div className="delta">days</div></div>
        <div className="stat"><div className="label">Avg vendor resubmit turnaround</div><div className="value">{avgResubmit != null ? avgResubmit.toFixed(1) : "—"}</div><div className="delta">days after a change request</div></div>
        <div className="stat"><div className="label">SLA breaches (open)</div><div className="value">{deptStats.reduce((s, d) => s + d.breaches, 0)}</div><div className="delta">across all departments</div></div>
      </div>

      <div className="card card-pad">
        <div className="section-label">Department speed vs SLA</div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Department</th><th>Avg decision (days)</th><th style={{ width: "40%" }}>Speed vs SLA</th><th>SLA</th><th>Breaches</th></tr></thead>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: 11.5, marginTop: 12 }}>
          Note: SLA breach excludes time paused during vendor resubmission windows (paused clocks don&apos;t count as breached).
        </p>
      </div>
    </Shell>
  );
}
