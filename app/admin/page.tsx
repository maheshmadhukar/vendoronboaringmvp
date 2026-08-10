import Link from "next/link";
import Shell from "@/app/components/Shell";
import { Chip, Empty } from "@/app/components/ui";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { VSTATUS, VSTATUS_LABEL, VSTATUS_TONE } from "@/lib/constants";
import { fmtDate, fmtMoney } from "@/lib/format";

export default async function AdminDashboard() {
  await requireAdmin();
  const vendors = await prisma.vendor.findMany({ orderBy: { updatedAt: "desc" } });

  const attention = vendors.filter((v) =>
    [VSTATUS.FLAGGED, VSTATUS.FINAL_PENDING, VSTATUS.HALTED].includes(v.status as never)
  );
  const onboarded = vendors.filter((v) => v.status === VSTATUS.ONBOARDED).length;
  const inFlight = vendors.filter((v) =>
    [VSTATUS.SUBMITTED, VSTATUS.IN_REVIEW, VSTATUS.CHANGES_REQUESTED, VSTATUS.DEPT_APPROVED, VSTATUS.FINAL_PENDING].includes(v.status as never)
  ).length;

  return (
    <Shell active="dashboard" title="Status Dashboard">
      <div className="page-head">
        <div>
          <h1>Status Dashboard</h1>
          <p>Oversight of every vendor onboarding, and the actions waiting on you.</p>
        </div>
      </div>

      <div className="grid-4" style={{ marginBottom: 22 }}>
        <div className="stat"><div className="label">Total vendors</div><div className="value">{vendors.length}</div></div>
        <div className="stat"><div className="label">In progress</div><div className="value">{inFlight}</div></div>
        <div className="stat"><div className="label">Needs your action</div><div className="value" style={{ color: attention.length ? "var(--accent)" : undefined }}>{attention.length}</div></div>
        <div className="stat"><div className="label">Onboarded</div><div className="value">{onboarded}</div></div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-pad" style={{ paddingBottom: 0 }}><div className="section-label">Pending your action</div></div>
        {attention.length === 0 ? (
          <Empty title="Nothing needs you right now" hint="Flagged and final-approval items will appear here." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Vendor</th><th>Status</th><th>Why</th><th></th></tr></thead>
              <tbody>
                {attention.map((v) => (
                  <tr key={v.id}>
                    <td className="strong">{v.name}</td>
                    <td><Chip tone={VSTATUS_TONE[v.status]}>{VSTATUS_LABEL[v.status]}</Chip></td>
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
        <div className="card-pad" style={{ paddingBottom: 0 }}><div className="section-label">All vendors</div></div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Vendor</th><th>Status</th><th>Value</th><th>Submitted</th><th></th></tr></thead>
            <tbody>
              {vendors.map((v) => (
                <tr key={v.id}>
                  <td><div className="strong">{v.name}</div><div className="sub">{v.companyEmail ?? "—"}</div></td>
                  <td><Chip tone={VSTATUS_TONE[v.status]}>{VSTATUS_LABEL[v.status]}</Chip></td>
                  <td className="tnum">{fmtMoney(v.valueAmount)}</td>
                  <td className="tnum">{fmtDate(v.submittedAt)}</td>
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
