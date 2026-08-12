import Link from "next/link";
import Shell from "@/app/components/Shell";
import { Chip, Empty } from "@/app/components/ui";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { VSTATUS, VSTATUS_LABEL, VSTATUS_TONE, DEPT_ORDER, DEPT_LABEL } from "@/lib/constants";
import { fmtDate, fmtMoney } from "@/lib/format";
import { reviewSlaVisual, workingDaysLeft, isBreached } from "@/lib/sla";
import { resolveDashboardRange, inRange } from "@/lib/period";
import { sendSlaReminders } from "@/lib/workflow";
import { resumeVendor } from "@/app/actions/admin";
import Spotlight from "./Spotlight";
import RangeSelect from "./RangeSelect";

const SLA_DEPTS = DEPT_ORDER.filter((k) => k !== "PROCUREMENT");

// Finer-grained color band for this cell only (the shared reviewSlaVisual
// tone system elsewhere in the app stays 4-color) — splits "warn" into a
// ≤2-days amber and a distinct "due today" light-orange.
function slaDotColor(r: { slaDueAt: Date | null; slaState: string; everBreached: boolean }): string {
  if (r.everBreached || isBreached(r.slaDueAt, r.slaState)) return "var(--bad)";
  if (r.slaState === "MET") return "var(--good)";
  if (r.slaState !== "RUNNING" || !r.slaDueAt) return "var(--ink-faint)";
  const dl = workingDaysLeft(r.slaDueAt);
  if (dl == null) return "var(--ink-faint)";
  if (dl <= 0) return "var(--due)";
  if (dl <= 2) return "var(--warn)";
  return "var(--good)";
}

function SlaCell({
  reviews,
}: {
  reviews: Array<{ department: { key: string }; slaStartedAt: Date | null; slaDueAt: Date | null; slaState: string; everBreached: boolean }>;
}) {
  const byDept = SLA_DEPTS.map((k) => reviews.find((r) => r.department.key === k)).filter(
    (r): r is NonNullable<typeof r> => !!r
  );
  if (byDept.length === 0) return <span className="sub">—</span>;
  return (
    <div style={{ display: "flex", gap: 5 }}>
      {byDept.map((r) => {
        const v = reviewSlaVisual(r);
        const bg = slaDotColor(r);
        return (
          <span
            key={r.department.key}
            title={`${DEPT_LABEL[r.department.key]}: ${v.label}`}
            style={{
              width: 20, height: 20, borderRadius: "50%", background: bg,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, fontWeight: 700, color: "#fff", flexShrink: 0,
            }}
          >
            {DEPT_LABEL[r.department.key][0]}
          </span>
        );
      })}
    </div>
  );
}

function StatLink({ href, label, value, valueColor }: { href: string; label: string; value: number; valueColor?: string }) {
  return (
    <Link href={href} className="stat stat-link">
      <div className="label">{label}</div>
      <div className="value" style={{ color: valueColor }}>{value}</div>
    </Link>
  );
}

type VendorTab = "all" | "inprogress" | "onboarded" | "rejected";
type SearchParams = { sort?: string; dir?: string; tab?: string; focus?: string; range?: string };

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin();
  const sp = await searchParams;
  await sendSlaReminders();
  const allVendors = await prisma.vendor.findMany({
    orderBy: { updatedAt: "desc" },
    include: { deptReviews: { include: { department: true } }, buyerDocs: { include: { template: true } } },
  });
  const { mode: rangeMode, from: rangeFrom } = resolveDashboardRange(sp.range);
  const now = new Date();
  const vendors = allVendors.filter(
    (v) => inRange(v.createdAt, rangeFrom, now) || inRange(v.submittedAt, rangeFrom, now)
  );

  const tab: VendorTab =
    sp.tab === "all" ? "all" : sp.tab === "onboarded" ? "onboarded" : sp.tab === "rejected" ? "rejected" : "inprogress";
  const onboardedList = vendors.filter((v) => v.status === VSTATUS.ONBOARDED);
  const rejectedList = vendors.filter((v) => v.status === VSTATUS.REJECTED);
  const inProgressList = vendors.filter((v) => v.status !== VSTATUS.ONBOARDED && v.status !== VSTATUS.REJECTED);
  const tabbed = tab === "all" ? vendors : tab === "onboarded" ? onboardedList : tab === "rejected" ? rejectedList : inProgressList;

  const sortingByValue = sp.sort === "value";
  const sortingBySubmitted = sp.sort === "submitted";
  const sortDir = sp.dir === "asc" ? "asc" : "desc";
  if (sortingByValue) {
    tabbed.sort((a, b) => {
      const av = a.valueAmount;
      const bv = b.valueAmount;
      if (av == null && bv == null) return 0;
      if (av == null) return 1; // nulls last regardless of direction
      if (bv == null) return -1;
      return sortDir === "asc" ? av - bv : bv - av;
    });
  } else if (sortingBySubmitted) {
    tabbed.sort((a, b) => {
      const av = a.submittedAt?.getTime();
      const bv = b.submittedAt?.getTime();
      if (av == null && bv == null) return 0;
      if (av == null) return 1; // nulls last regardless of direction
      if (bv == null) return -1;
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }
  const sortSuffix = sortingByValue ? `&sort=value&dir=${sortDir}` : sortingBySubmitted ? `&sort=submitted&dir=${sortDir}` : "";
  const tabHref = (t: VendorTab) => `?tab=${t}`;
  const valueSortHref = `?tab=${tab}&sort=value&dir=${sortingByValue && sortDir === "desc" ? "asc" : "desc"}`;
  const submittedSortHref = `?tab=${tab}&sort=submitted&dir=${sortingBySubmitted && sortDir === "desc" ? "asc" : "desc"}`;

  const attention = vendors.filter((v) =>
    [VSTATUS.FINAL_PENDING, VSTATUS.HALTED].includes(v.status as never)
  );
  const inFlight = inProgressList.length;

  function msaNdaStatus(v: (typeof vendors)[number]): "done" | "in-progress" | "na" {
    const hasMsa = v.buyerDocs.some((d) => d.template.key === "MSA");
    if (!hasMsa) return "na";
    return v.buyerDocs.every((d) => d.signedAt) ? "done" : "in-progress";
  }
  const colCount = tab === "inprogress" ? 7 : 6;
  const spotlightKey = [sp.tab, sp.focus, sp.sort, sp.dir, sp.range].join("|");

  return (
    <Shell active="dashboard" title="Status Dashboard">
      <Spotlight key={spotlightKey} targetId={sp.focus ?? null} />
      <div className="page-head">
        <div>
          <h1>Status Dashboard</h1>
          <p>Oversight of every vendor onboarding, and the actions waiting on you.</p>
        </div>
        <RangeSelect mode={rangeMode} />
      </div>

      <div className="grid-4" style={{ marginBottom: 22 }}>
        <StatLink href="?tab=all&focus=all-vendors" label="Total vendors" value={vendors.length} />
        <StatLink href="?tab=inprogress&focus=all-vendors" label="In progress" value={inFlight} />
        <StatLink
          href={`?tab=${tab}&focus=pending-action`}
          label="Needs your action"
          value={attention.length}
          valueColor={attention.length ? "var(--accent)" : undefined}
        />
        <StatLink href="?tab=onboarded&focus=all-vendors" label="Onboarded" value={onboardedList.length} />
      </div>

      <div className="card" id="pending-action" style={{ marginBottom: 18 }}>
        <div className="card-pad" style={{ paddingBottom: 0 }}><div className="section-label">Pending your action</div></div>
        {attention.length === 0 ? (
          <Empty title="Nothing needs you right now" hint="Final-approval items will appear here." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Vendor</th><th>Status</th><th>SLA</th><th>Why</th><th></th></tr></thead>
              <tbody>
                {attention.map((v) => (
                  <tr key={v.id}>
                    <td className="strong">{v.name}</td>
                    <td><Chip tone={VSTATUS_TONE[v.status]}>{VSTATUS_LABEL[v.status]}</Chip></td>
                    <td className="tnum"><SlaCell reviews={v.deptReviews} /></td>
                    <td className="sub">
                      {v.status === VSTATUS.FINAL_PENDING ? "All departments approved — final approval" :
                       "Onboarding paused — review or resume"}
                    </td>
                    <td><Link className="btn sm primary" href={`/admin/vendors/${v.id}`}>Open</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" id="all-vendors">
        <div className="card-pad" style={{ paddingBottom: 0 }}>
          <div className="section-label">All vendors</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
            <Link className={`btn sm ${tab === "all" ? "primary" : "ghost"}`} href={tabHref("all") + sortSuffix}>
              All vendors ({vendors.length})
            </Link>
            <Link className={`btn sm ${tab === "inprogress" ? "primary" : "ghost"}`} href={tabHref("inprogress") + sortSuffix}>
              Onboarding in progress ({inProgressList.length})
            </Link>
            <Link className={`btn sm ${tab === "onboarded" ? "primary" : "ghost"}`} href={tabHref("onboarded") + sortSuffix}>
              Onboarded ({onboardedList.length})
            </Link>
            <Link className={`btn sm ${tab === "rejected" ? "primary" : "ghost"}`} href={tabHref("rejected") + sortSuffix}>
              Rejected ({rejectedList.length})
            </Link>
          </div>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Vendor</th><th>Status</th><th>SLA</th><th>
              <Link href={valueSortHref} style={{ color: "inherit" }}>
                Value{sortingByValue ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
              </Link>
            </th><th>
              <Link href={submittedSortHref} style={{ color: "inherit" }}>
                VENDOR DOCUMENTS SUBMITTED{sortingBySubmitted ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
              </Link>
            </th>{tab === "inprogress" ? <th>Vendor MSA/NDA review</th> : null}<th></th></tr></thead>
            <tbody>
              {tabbed.length === 0 ? (
                <tr><td colSpan={colCount}><Empty title="No vendors here" hint="Nothing in this tab yet." /></td></tr>
              ) : tabbed.map((v) => (
                <tr key={v.id}>
                  <td><div className="strong">{v.name}</div><div className="sub">{v.companyEmail ?? "—"}</div></td>
                  <td><Chip tone={VSTATUS_TONE[v.status]}>{VSTATUS_LABEL[v.status]}</Chip></td>
                  <td className="tnum"><SlaCell reviews={v.deptReviews} /></td>
                  <td className="tnum">{fmtMoney(v.valueAmount)}</td>
                  <td className="tnum">{fmtDate(v.submittedAt)}</td>
                  {tab === "inprogress" ? (() => {
                    const status = msaNdaStatus(v);
                    const label = status === "done" ? "Done" : status === "in-progress" ? "In progress" : "Not-Applicable";
                    return <td><Chip tone={status === "done" ? "good" : "neutral"}>{label}</Chip></td>;
                  })() : null}
                  <td style={{ display: "flex", gap: 6 }}>
                    <Link className="btn sm" href={`/admin/vendors/${v.id}`}>View</Link>
                    {v.status === VSTATUS.HALTED ? (
                      <form action={resumeVendor}>
                        <input type="hidden" name="vendorId" value={v.id} />
                        <button className="btn sm primary">Resume</button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}
