import Link from "next/link";
import Shell from "@/app/components/Shell";
import { Chip, Empty } from "@/app/components/ui";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { VSTATUS, VSTATUS_LABEL, VSTATUS_TONE } from "@/lib/constants";
import { fmtDate, fmtMoney } from "@/lib/format";
import { vendorSlaSummary } from "@/lib/sla";
import FlipStatCard from "./FlipStatCard";

function SlaCell({ reviews }: { reviews: Parameters<typeof vendorSlaSummary>[0] }) {
  const sla = vendorSlaSummary(reviews);
  if (sla.kind === "clear") return <span className="sub">—</span>;
  if (sla.kind === "breached") return <Chip tone="bad">{sla.label}</Chip>;
  return (
    <div>
      <Chip tone={sla.tone}>{sla.label}</Chip>
      <div className="bar-track" style={{ marginTop: 5, height: 5, minWidth: 90 }}>
        <div
          className="bar-fill"
          style={{
            width: `${sla.pct}%`,
            background: sla.tone === "warn" ? "var(--warn)" : sla.tone === "bad" ? "var(--bad)" : "var(--good)",
          }}
        />
      </div>
    </div>
  );
}

type VendorTab = "inprogress" | "onboarded" | "rejected";
type SearchParams = { sort?: string; dir?: string; tab?: string };

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin();
  const sp = await searchParams;
  const vendors = await prisma.vendor.findMany({
    orderBy: { updatedAt: "desc" },
    include: { deptReviews: true, buyerDocs: { include: { template: true } } },
  });

  const tab: VendorTab = sp.tab === "onboarded" ? "onboarded" : sp.tab === "rejected" ? "rejected" : "inprogress";
  const onboardedList = vendors.filter((v) => v.status === VSTATUS.ONBOARDED);
  const rejectedList = vendors.filter((v) => v.status === VSTATUS.REJECTED);
  const inProgressList = vendors.filter((v) => v.status !== VSTATUS.ONBOARDED && v.status !== VSTATUS.REJECTED);
  const tabbed = tab === "onboarded" ? onboardedList : tab === "rejected" ? rejectedList : inProgressList;

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
    [VSTATUS.FLAGGED, VSTATUS.FINAL_PENDING, VSTATUS.HALTED].includes(v.status as never)
  );
  const inFlight = inProgressList.length;

  function msaNdaStatus(v: (typeof vendors)[number]): "done" | "in-progress" | "na" {
    const hasMsa = v.buyerDocs.some((d) => d.template.key === "MSA");
    if (!hasMsa) return "na";
    return v.buyerDocs.every((d) => d.signedAt) ? "done" : "in-progress";
  }
  const colCount = tab === "inprogress" ? 7 : 6;

  return (
    <Shell active="dashboard" title="Status Dashboard">
      <div className="page-head">
        <div>
          <h1>Status Dashboard</h1>
          <p>Oversight of every vendor onboarding, and the actions waiting on you.</p>
        </div>
      </div>

      <div className="grid-4" style={{ marginBottom: 22 }}>
        <FlipStatCard label="Total vendors" value={vendors.length} vendors={vendors.map((v) => ({ id: v.id, name: v.name }))} />
        <div className="stat"><div className="label">In progress</div><div className="value">{inFlight}</div></div>
        <div className="stat"><div className="label">Needs your action</div><div className="value" style={{ color: attention.length ? "var(--accent)" : undefined }}>{attention.length}</div></div>
        <div className="stat"><div className="label">Onboarded</div><div className="value">{onboardedList.length}</div></div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-pad" style={{ paddingBottom: 0 }}><div className="section-label">Pending your action</div></div>
        {attention.length === 0 ? (
          <Empty title="Nothing needs you right now" hint="Flagged and final-approval items will appear here." />
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
                      {v.status === VSTATUS.FLAGGED ? "Flagged by a department — audit needed" :
                       v.status === VSTATUS.FINAL_PENDING ? "All departments approved — final approval" :
                       "Halted — review or resume"}
                    </td>
                    <td><Link className="btn sm primary" href={`/admin/vendors/${v.id}`}>Open</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-pad" style={{ paddingBottom: 0 }}>
          <div className="section-label">All vendors</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
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
                  <td><Link className="btn sm" href={`/admin/vendors/${v.id}`}>View</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}
