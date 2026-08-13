import Link from "next/link";
import Shell from "@/app/components/Shell";
import { Empty } from "@/app/components/ui";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { fmtMoney, fmtMoneyCompact } from "@/lib/format";
import { resolvePeriod, previousPeriod, type PeriodMode } from "@/lib/period";
import {
  computeExecutive, computeFunnel, computeDeptBottlenecks,
  computeEngagement, computeQuality, computeTrends, computeStageTime, type VendorRow,
} from "@/lib/analytics";
import SectionHeader from "./components/SectionHeader";
import KpiCard from "./components/KpiCard";
import ChartCard from "./components/ChartCard";
import HBars from "./components/HBars";
import FunnelBars from "./components/FunnelBars";
import TrendLineChart from "./charts/TrendLineChart";
import DocCompletionDist from "./charts/DocCompletionDist";

type SearchParams = { mode?: string; y?: string; q?: string; from?: string; to?: string; tab?: string };

const fmtDays = (n: number | null | undefined) => (n == null ? "—" : n.toFixed(1));
const fmtPct = (n: number | null | undefined) => (n == null ? "—" : `${n}%`);

export default async function Analytics({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin();
  const sp = await searchParams;
  // Default to the year view — the current quarter is only weeks old, so a
  // quarter default reads sparse; the user can still switch to Quarter/Custom.
  const period = resolvePeriod({ mode: "year", ...sp });
  const prev = previousPeriod(period);

  const [vendorsRaw, departments, docTypeCount] = await Promise.all([
    prisma.vendor.findMany({
      include: {
        deptReviews: { include: { department: true } },
        documents: { include: { documentType: true } },
        comments: true,
      },
    }),
    prisma.department.findMany(),
    prisma.documentType.count({ where: { active: true } }),
  ]);
  const vendors = vendorsRaw as VendorRow[];

  const exec = computeExecutive(vendors, period, prev);
  const funnel = computeFunnel(vendors, period);
  const { speed, queue } = computeDeptBottlenecks(vendors, departments, period);
  const engagement = computeEngagement(vendors, docTypeCount);
  const quality = computeQuality(vendors, period);
  const trends = computeTrends(vendors, 12);
  const stageTime = computeStageTime(vendors, departments);

  const stageRows = [
    { label: "Vendor prep", value: stageTime.prep, color: "var(--ink-faint)" },
    ...stageTime.perDept.map((d) => ({ label: d.label, value: d.avgDays, color: "var(--accent)" })),
    { label: "Critical path", value: stageTime.criticalPath, color: "var(--warn)" },
  ];

  const tab = sp.tab === "business" ? "business" : "performance";
  const tabHref = (t: "business" | "performance") => {
    const params = new URLSearchParams();
    if (sp.mode) params.set("mode", sp.mode);
    if (sp.y) params.set("y", sp.y);
    if (sp.q) params.set("q", sp.q);
    if (sp.from) params.set("from", sp.from);
    if (sp.to) params.set("to", sp.to);
    params.set("tab", t);
    return `?${params.toString()}`;
  };
  const modeHref = (mode: PeriodMode) => {
    if (mode === "quarter") return `?mode=quarter&tab=${tab}`;
    if (mode === "year") return `?mode=year&tab=${tab}`;
    return `?mode=custom&from=${period.fromInput}&to=${period.toInput}&tab=${tab}`;
  };
  const inputStyle = { fontSize: 13, padding: "6px 8px", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-sm)", background: "var(--panel)", color: "var(--ink)" };

  return (
    <Shell active="analytics" title="Analytics">
      <div className="page-head">
        <div>
          <h1>Onboarding Analytics</h1>
          <p>Pipeline health, department bottlenecks, and what operations should act on today — for department managers and the ops team.</p>
        </div>
      </div>

      {/* Period control */}
      <div className="card card-pad" style={{ marginBottom: 22 }}>
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
              <input type="hidden" name="tab" value={tab} />
              <input type="date" name="from" defaultValue={period.fromInput} className="tnum" style={inputStyle} />
              <span className="sub">to</span>
              <input type="date" name="to" defaultValue={period.toInput} className="tnum" style={inputStyle} />
              <button className="btn sm primary" type="submit">Apply</button>
            </form>
          )}
          <span className="sub" style={{ marginLeft: "auto" }}>{period.rangeLabel}</span>
        </div>
      </div>

      {/* Business Metrics / Performance Metrics tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 22 }}>
        <Link className={`btn sm ${tab === "business" ? "primary" : "ghost"}`} href={tabHref("business")}>Business Metrics</Link>
        <Link className={`btn sm ${tab === "performance" ? "primary" : "ghost"}`} href={tabHref("performance")}>Performance Metrics</Link>
      </div>

      {tab === "business" ? (
        <>
          {/* ============ Business outcomes ============ */}
          <div className="an-section">
            <SectionHeader
              title="Business outcomes"
              help="What onboarding has delivered, this period."
            />
            <div className="grid-4">
              <KpiCard label="Vendors onboarded" value={String(exec.onboarded.value)} deltaPct={exec.onboarded.deltaPct} sub={`${period.label} · completed onboardings`} />
              <KpiCard label="Total onboarded value" value={fmtMoneyCompact(exec.onboardedValue.value)} deltaPct={exec.onboardedValue.deltaPct} sub="Contract value onboarded" />
              <KpiCard label="Avg onboarding time" value={exec.avgOnboardDays.has ? `${fmtDays(exec.avgOnboardDays.value)}d` : "—"} deltaPct={exec.avgOnboardDays.deltaPct} higherIsBetter={false} sub="Submit → onboarded" />
              <KpiCard label="Acceptance rate" value={exec.acceptanceRate.has ? `${exec.acceptanceRate.value}%` : "—"} deltaPct={exec.acceptanceRate.deltaPct} deltaSuffix="pt" sub="Approved of decided" />
            </div>
          </div>

          {/* ============ Vendor Pipeline ============ */}
          <div className="an-section">
            <SectionHeader
              title="Vendor Pipeline"
              help={`Where the cohort invited in ${period.label} is today, and what the in-flight pipeline is likely to convert to.`}
            />
            <ChartCard title="Onboarding funnel" sub={`Cohort invited in ${period.label} · conversion and drop-off by stage`}>
              {funnel.stages[0].count === 0 ? (
                <Empty title="No vendors invited in this period" hint="Pick a wider range to see the funnel." />
              ) : (
                <>
                  <FunnelBars stages={funnel.stages} />
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14, alignItems: "center", fontSize: 12.5 }}>
                    <span className="sub">Rejected (of cohort):</span>
                    <span className="tnum" style={{ fontWeight: 700, color: funnel.rejected ? "var(--bad)" : "var(--ink-faint)" }}>{funnel.rejected}</span>
                  </div>
                </>
              )}
            </ChartCard>
          </div>
        </>
      ) : (
        <>
          {/* ============ Operational snapshot ============ */}
          <div className="an-section">
            <SectionHeader
              title="Operational snapshot"
              help="Pending work and where you're most at risk of missing SLA."
            />
            <div className="grid-2">
              <KpiCard label="Pending approvals" value={String(exec.pendingApprovals)} sub="Department reviews awaiting action" />
              <KpiCard label="Vendors at SLA risk" value={String(exec.atRisk)} sub="Amber or breached, needs attention" />
            </div>
          </div>

          {/* ============ Trends ============ */}
          <div className="an-section">
            <SectionHeader
              title="Trends"
              help="Whether rising onboarding volume is straining operational efficiency, and where end-to-end time is spent."
            />
            <div className="grid-2">
              <ChartCard title="Vendors onboarded" sub="Monthly, last 12 months">
                <TrendLineChart data={trends} metric="onboarded" />
              </ChartCard>
              <ChartCard title="Avg onboarding time" sub="Monthly, last 12 months — days, submit → onboarded">
                <TrendLineChart data={trends} metric="avgDays" />
              </ChartCard>
            </div>
          </div>

          {/* ============ Department Bottlenecks ============ */}
          <div className="an-section">
            <SectionHeader
              title="Department Bottlenecks"
              help="Which department is slowing onboarding down — the queue predicts future delays before they become breaches."
            />
            <div className="grid-2">
              <ChartCard title="Approval speed by department" sub={`Avg decision time vs each department's own SLA · decisions made in ${period.label}`}>
                <HBars
                  unit="d"
                  rows={speed.map((s) => ({
                    label: s.label,
                    value: s.avgDays,
                    color: s.overSla ? "var(--bad)" : "var(--accent)",
                    marker: { value: s.slaDays, label: `SLA ${s.slaDays}d` },
                  }))}
                />
              </ChartCard>
              <ChartCard title="Current approval queue" sub="Live snapshot — pending work and aging by department">
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>Department</th><th>Pending</th><th>Over SLA</th><th>Oldest</th><th>Avg age</th></tr></thead>
                    <tbody>
                      {queue.map((q) => (
                        <tr key={q.key}>
                          <td className="strong">{q.label}</td>
                          <td className="tnum">{q.pending}</td>
                          <td className="tnum" style={{ color: q.overSla ? "var(--bad)" : undefined }}>{q.overSla}</td>
                          <td className="tnum">{q.oldestDays == null ? "—" : `${q.oldestDays.toFixed(0)}d`}</td>
                          <td className="tnum">{q.avgAgeDays == null ? "—" : `${q.avgAgeDays.toFixed(1)}d`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ChartCard>
            </div>
            <div style={{ marginTop: 18 }}>
              <ChartCard
                title="Where time is spent"
                sub="Vendor prep is sequential; the three department reviews run in parallel (not summed). Critical path = the slowest department, which actually gates onboarding."
              >
                <HBars unit="d" labelWidth={100} rows={stageRows} />
              </ChartCard>
            </div>
          </div>

          {/* ============ Vendor Behavior & Quality ============ */}
          <div className="an-section">
            <SectionHeader
              title="Vendor Behavior & Quality"
              help="How vendors move through onboarding, and how much rework the process creates."
            />
            <ChartCard title="Rework & quality" sub={`Change requests, revisions, and why documents get sent back · ${period.label}`}>
              <div className="grid-3" style={{ marginBottom: 14 }}>
                <div className="stat"><div className="label">Change-request rate</div><div className="value" style={{ color: quality.changeRequestRate ? "var(--warn)" : undefined }}>{fmtPct(quality.changeRequestRate)}</div></div>
                <div className="stat"><div className="label">Avg revisions / vendor</div><div className="value">{quality.avgRevisions == null ? "—" : quality.avgRevisions.toFixed(2)}</div></div>
                <div className="stat"><div className="label">Most rejected doc</div><div className="value" style={{ fontSize: 14, lineHeight: 1.3 }}>{quality.mostRejected ? quality.mostRejected.name : "—"}</div>{quality.mostRejected ? <div className="delta">{quality.mostRejected.count} times</div> : null}</div>
              </div>
              <div className="section-label" style={{ marginBottom: 6 }}>Top rejection reasons</div>
              {quality.reasons.length === 0 ? (
                <Empty title="No categorized rejections yet" hint="Reasons appear as departments reject or request changes." />
              ) : (
                <HBars labelWidth={150} rows={quality.reasons.map((r) => ({ label: r.label, value: r.count, color: "var(--bad)" }))} />
              )}
            </ChartCard>

            <details className="an-collapsible" style={{ marginTop: 18 }}>
              <summary>Show vendor engagement</summary>
              <ChartCard title="Vendor engagement" sub="Time-in-stage and completeness across active vendors">
                <div className="grid-3" style={{ marginBottom: 14 }}>
                  <div className="stat"><div className="label">To register</div><div className="value">{fmtDays(engagement.timeToRegister)}<span style={{ fontSize: 13 }}>d</span></div></div>
                  <div className="stat"><div className="label">To start</div><div className="value">{fmtDays(engagement.timeToStart)}<span style={{ fontSize: 13 }}>d</span></div></div>
                  <div className="stat"><div className="label">To first doc</div><div className="value">{fmtDays(engagement.timeToFirstDoc)}<span style={{ fontSize: 13 }}>d</span></div></div>
                  <div className="stat"><div className="label">To complete docs</div><div className="value">{fmtDays(engagement.timeToComplete)}<span style={{ fontSize: 13 }}>d</span></div></div>
                  <div className="stat"><div className="label">Inactive &gt; 7 days</div><div className="value" style={{ color: engagement.inactivePct ? "var(--warn)" : undefined }}>{fmtPct(engagement.inactivePct)}</div></div>
                  <div className="stat"><div className="label">Incomplete docs</div><div className="value" style={{ color: engagement.incompletePct ? "var(--warn)" : undefined }}>{fmtPct(engagement.incompletePct)}</div></div>
                </div>
                <div className="section-label" style={{ marginBottom: 6 }}>Document completion — {engagement.activeCount} active vendors</div>
                <DocCompletionDist data={engagement.distribution} />
              </ChartCard>
            </details>
          </div>
        </>
      )}
    </Shell>
  );
}
