import Link from "next/link";
import Shell from "@/app/components/Shell";
import { Chip, Empty } from "@/app/components/ui";
import RangeSelect from "@/app/admin/RangeSelect";
import { requireDept } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/workflow";
import { DEPT, DEPT_LABEL, REVIEW_STATUS, REVIEW_TONE, ROLE, VSTATUS } from "@/lib/constants";
import { fmtDate } from "@/lib/format";
import { isBreached, slaVisual, workingDaysLeft } from "@/lib/sla";
import { resolveDashboardRange } from "@/lib/period";

type SearchParams = { range?: string; tab?: string };

export default async function DeptQueue({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireDept();
  const dept = user.department!;

  if (dept.key === DEPT.PROCUREMENT) {
    return <OnboardedVendors searchParams={searchParams} />;
  }

  const [cfg, allReviews] = await Promise.all([
    getConfig(),
    prisma.deptReview.findMany({
      where: { departmentId: dept.id },
      include: { vendor: true },
      orderBy: [{ status: "asc" }, { slaDueAt: "asc" }],
    }),
  ]);
  // Halted onboardings are invisible to departments entirely, not just read-only.
  const reviews = allReviews.filter((r) => r.vendor.status !== VSTATUS.HALTED);
  const pending = reviews.filter((r) => r.status === REVIEW_STATUS.PENDING);
  const done = reviews.filter((r) => r.status !== REVIEW_STATUS.PENDING);

  const breachedCount = pending.filter((r) => isBreached(r.slaDueAt, r.slaState)).length;
  // Amber = within 2 days of the due date and not already breached — mirrors the warn threshold in lib/sla.ts.
  const amber = pending.filter((r) => {
    if (isBreached(r.slaDueAt, r.slaState)) return false;
    const dl = workingDaysLeft(r.slaDueAt);
    return dl != null && dl <= 2;
  });

  return (
    <Shell active={user.role === ROLE.ADMIN ? "procurement" : "queue"} title={`${DEPT_LABEL[dept.key]} — Review Queue`}>
      <div className="page-head">
        <div>
          <h1>{DEPT_LABEL[dept.key]} Review Queue</h1>
          <p>Vendors routed to your department. You review only {DEPT_LABEL[dept.key]} documents; other departments handle theirs.</p>
        </div>
      </div>

      {amber.length > 0 ? (
        <div className="alert warn" style={{ marginBottom: 18 }}>
          <span>
            <b>SLA reminder:</b> {amber.map((r) => r.vendor.name).join(", ")}{" "}
            {amber.length === 1 ? "is" : "are"} due within 2 days.
          </span>
        </div>
      ) : null}

      <div className="grid-3" style={{ marginBottom: 20 }}>
        <div className="stat"><div className="label">Awaiting your review</div><div className="value">{pending.length}</div></div>
        <div className="stat"><div className="label">SLA breached</div><div className="value" style={{ color: breachedCount ? "var(--bad)" : undefined }}>{breachedCount}</div></div>
        <div className="stat"><div className="label">Actioned</div><div className="value">{done.length}</div></div>
      </div>

      <div className="card">
        <div className="card-pad" style={{ paddingBottom: 0 }}><div className="section-label">Action needed</div></div>
        {pending.length === 0 ? (
          <Empty title="You're all caught up" hint={`No vendors are currently awaiting ${DEPT_LABEL[dept.key]} review.`} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Vendor</th><th>Submitted</th><th>SLA due</th>{cfg.aiReviewDefault ? <th>AI review</th> : null}<th>Status</th><th></th></tr></thead>
              <tbody>
                {pending.map((r) => {
                  const sla = slaVisual(r.slaStartedAt, r.slaDueAt, r.slaState);
                  return (
                    <tr key={r.id}>
                      <td><div className="strong">{r.vendor.name}</div><div className="sub">{r.vendor.category}</div></td>
                      <td className="tnum">{fmtDate(r.vendor.submittedAt)}</td>
                      <td className="tnum">
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <Chip tone={sla.tone}>{sla.label}</Chip>
                          <span className="sub">{fmtDate(r.slaDueAt)}</span>
                        </div>
                        <div className="bar-track" style={{ marginTop: 5, height: 5, minWidth: 90 }}>
                          <div
                            className="bar-fill"
                            style={{
                              width: `${sla.pct}%`,
                              background: sla.tone === "bad" ? "var(--bad)" : sla.tone === "warn" ? "var(--warn)" : sla.tone === "neutral" ? "var(--ink-faint)" : "var(--good)",
                            }}
                          />
                        </div>
                      </td>
                      {cfg.aiReviewDefault ? (
                        <td><Chip tone="info">✦ {r.vendor.status === "CHANGES_REQUESTED" ? "check flagged fields" : "no high-risk items"}</Chip></td>
                      ) : null}
                      <td><Chip tone={REVIEW_TONE[r.status]}>{r.status.replace(/_/g, " ").toLowerCase()}</Chip></td>
                      <td><Link className="btn sm primary" href={`/dept/review/${r.vendorId}`}>Review</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {done.length > 0 ? (
        <div className="card" style={{ marginTop: 18 }}>
          <div className="card-pad" style={{ paddingBottom: 0 }}><div className="section-label">Already actioned</div></div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Vendor</th><th>Decision</th><th></th></tr></thead>
              <tbody>
                {done.map((r) => (
                  <tr key={r.id}>
                    <td className="strong">{r.vendor.name}</td>
                    <td><Chip tone={REVIEW_TONE[r.status]}>{r.status.replace(/_/g, " ").toLowerCase()}</Chip></td>
                    <td><Link className="btn sm" href={`/dept/review/${r.vendorId}`}>View</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </Shell>
  );
}

async function OnboardedVendors({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const tab: "onboarded" | "drafts" = sp.tab === "drafts" ? "drafts" : "onboarded";
  const { mode: rangeMode, from } = resolveDashboardRange(sp.range);

  const [onboardedVendors, draftVendors] = await Promise.all([
    prisma.vendor.findMany({
      where: { status: VSTATUS.ONBOARDED, onboardedAt: { gte: from, lte: new Date() } },
      orderBy: { onboardedAt: "desc" },
    }),
    prisma.vendor.findMany({
      where: { status: VSTATUS.DRAFT },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const vendors = tab === "drafts" ? draftVendors : onboardedVendors;

  return (
    <Shell active="procurement" title="Procurement — Onboarded Vendors">
      <div className="page-head">
        <div>
          <h1>{tab === "drafts" ? "Draft Vendors" : "Onboarded Vendors"}</h1>
          <p>
            {tab === "drafts"
              ? "Vendor records created but not yet invited through or submitted."
              : "Vendors who have completed onboarding. View their full submitted document set."}
          </p>
        </div>
        {tab === "onboarded" ? <RangeSelect mode={rangeMode} /> : null}
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        <Link
          className={`btn sm ${tab === "onboarded" ? "primary" : "ghost"}`}
          href={`?tab=onboarded${sp.range ? `&range=${sp.range}` : ""}`}
        >
          Onboarded Vendors ({onboardedVendors.length})
        </Link>
        <Link className={`btn sm ${tab === "drafts" ? "primary" : "ghost"}`} href="?tab=drafts">
          See Drafts ({draftVendors.length})
        </Link>
      </div>

      <div className="card">
        {vendors.length === 0 ? (
          tab === "drafts" ? (
            <Empty title="No draft vendors" hint="Nothing here right now." />
          ) : (
            <Empty title="No onboarded vendors in this window" hint="Try a wider date range." />
          )
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Vendor</th><th>Category</th><th>{tab === "drafts" ? "Created" : "Onboarded"}</th><th></th></tr></thead>
              <tbody>
                {tab === "drafts"
                  ? draftVendors.map((v) => (
                      <tr key={v.id}>
                        <td className="strong">{v.name}</td>
                        <td className="sub">{v.category}</td>
                        <td className="tnum">{fmtDate(v.createdAt)}</td>
                        <td><Link className="btn sm" href={`/admin/vendors/${v.id}`}>View</Link></td>
                      </tr>
                    ))
                  : onboardedVendors.map((v) => (
                      <tr key={v.id}>
                        <td className="strong">{v.name}</td>
                        <td className="sub">{v.category}</td>
                        <td className="tnum">{fmtDate(v.onboardedAt)}</td>
                        <td><Link className="btn sm" href={`/dept/onboarded/${v.id}`}>View</Link></td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Shell>
  );
}
