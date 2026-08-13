import Link from "next/link";
import Shell from "@/app/components/Shell";
import { Chip, Empty } from "@/app/components/ui";
import RangeSelect from "@/app/admin/RangeSelect";
import { requireDept, getLoginFlash } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/workflow";
import { DEPT, DEPT_LABEL, REVIEW_STATUS, REVIEW_TONE, ROLE, VSTATUS } from "@/lib/constants";
import { fmtDate } from "@/lib/format";
import { isBreached, slaVisual, workingDaysLeft } from "@/lib/sla";
import { resolveDashboardRange } from "@/lib/period";
import RealtimeRefresh from "@/app/components/RealtimeRefresh";
import { paginate } from "@/lib/paginate";
import Pagination from "@/app/components/Pagination";
import ScrollToActioned from "./ScrollToActioned";
import SlaBreachPopup from "./SlaBreachPopup";

type SearchParams = {
  range?: string;
  highlight?: "pending" | "breached" | "actioned";
  pendingPage?: string;
  actionedPage?: string;
  vendorsPage?: string;
};

export default async function DeptQueue({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireDept();
  const dept = user.department!;

  if (dept.key === DEPT.PROCUREMENT) {
    return <OnboardedVendors searchParams={searchParams} />;
  }

  const sp = await searchParams;

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

  const breachedRows = pending.filter((r) => isBreached(r.slaDueAt, r.slaState));
  const breachedCount = breachedRows.length;
  // Amber = within 2 days of the due date and not already breached — mirrors the warn threshold in lib/sla.ts.
  const amber = pending.filter((r) => {
    if (isBreached(r.slaDueAt, r.slaState)) return false;
    const dl = workingDaysLeft(r.slaDueAt);
    return dl != null && dl <= 2;
  });

  const justLoggedIn = await getLoginFlash();

  const pendingPagination = paginate(pending, Number(sp.pendingPage) || 1);
  const donePagination = paginate(done, Number(sp.actionedPage) || 1);

  return (
    <Shell active={user.role === ROLE.ADMIN ? "procurement" : "queue"} title={`${DEPT_LABEL[dept.key]} — Review Queue`}>
      {/* Phase 5: refresh the queue live as vendors submit / reviews change. */}
      <RealtimeRefresh
        channelName={`dept-queue-${dept.id}`}
        subscriptions={[
          { table: "DeptReview", filter: `departmentId=eq.${dept.id}` },
          { table: "Vendor" },
          { table: "Document" },
        ]}
      />
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

      <ScrollToActioned active={sp.highlight === "actioned"} />
      <SlaBreachPopup justLoggedIn={justLoggedIn} vendorNames={breachedRows.map((r) => r.vendor.name)} />

      <div className="grid-3" style={{ marginBottom: 20 }}>
        <Link
          href={sp.highlight === "pending" ? "?" : "?highlight=pending"}
          className={`stat stat-link${sp.highlight === "pending" ? " active" : ""}`}
        >
          <div className="label">Awaiting your review</div><div className="value">{pending.length}</div>
        </Link>
        <Link
          href={sp.highlight === "breached" ? "?" : "?highlight=breached"}
          className={`stat stat-link${sp.highlight === "breached" ? " active" : ""}`}
        >
          <div className="label">SLA breached</div><div className="value" style={{ color: breachedCount ? "var(--bad)" : undefined }}>{breachedCount}</div>
        </Link>
        <Link
          href={sp.highlight === "actioned" ? "?" : "?highlight=actioned"}
          className={`stat stat-link${sp.highlight === "actioned" ? " active" : ""}`}
        >
          <div className="label">Actioned</div><div className="value">{done.length}</div>
        </Link>
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
                {pendingPagination.pageItems.map((r) => {
                  const sla = slaVisual(r.slaStartedAt, r.slaDueAt, r.slaState);
                  const rowBreached = isBreached(r.slaDueAt, r.slaState);
                  const dimmed = sp.highlight != null && !(sp.highlight === "pending" || (sp.highlight === "breached" && rowBreached));
                  return (
                    <tr key={r.id} className={dimmed ? "row-dim" : undefined}>
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
            <Pagination paramKey="pendingPage" page={pendingPagination.page} totalPages={pendingPagination.totalPages} />
          </div>
        )}
      </div>

      {done.length > 0 ? (
        <div className="card" id="already-actioned" style={{ marginTop: 18 }}>
          <div className="card-pad" style={{ paddingBottom: 0 }}><div className="section-label">Already actioned</div></div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Vendor</th><th>Decision</th><th></th></tr></thead>
              <tbody>
                {donePagination.pageItems.map((r) => {
                  const dimmed = sp.highlight != null && sp.highlight !== "actioned";
                  return (
                    <tr key={r.id} className={dimmed ? "row-dim" : undefined}>
                      <td className="strong">{r.vendor.name}</td>
                      <td><Chip tone={REVIEW_TONE[r.status]}>{r.status.replace(/_/g, " ").toLowerCase()}</Chip></td>
                      <td><Link className="btn sm" href={`/dept/review/${r.vendorId}`}>View</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pagination paramKey="actionedPage" page={donePagination.page} totalPages={donePagination.totalPages} />
          </div>
        </div>
      ) : null}
    </Shell>
  );
}

async function OnboardedVendors({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const { mode: rangeMode, from } = resolveDashboardRange(sp.range);

  const vendors = await prisma.vendor.findMany({
    where: { status: VSTATUS.ONBOARDED, onboardedAt: { gte: from, lte: new Date() } },
    orderBy: { onboardedAt: "desc" },
  });
  const vendorsPagination = paginate(vendors, Number(sp.vendorsPage) || 1);

  return (
    <Shell active="procurement" title="Procurement — Onboarded Vendors">
      <div className="page-head">
        <div>
          <h1>Onboarded Vendors</h1>
          <p>Vendors who have completed onboarding. View their full submitted document set.</p>
        </div>
        <RangeSelect mode={rangeMode} />
      </div>

      <div className="card">
        {vendors.length === 0 ? (
          <Empty title="No onboarded vendors in this window" hint="Try a wider date range." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Vendor</th><th>Category</th><th>Onboarded</th><th></th></tr></thead>
              <tbody>
                {vendorsPagination.pageItems.map((v) => (
                  <tr key={v.id}>
                    <td className="strong">{v.name}</td>
                    <td className="sub">{v.category}</td>
                    <td className="tnum">{fmtDate(v.onboardedAt)}</td>
                    <td><Link className="btn sm" href={`/dept/onboarded/${v.id}`}>View</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination paramKey="vendorsPage" page={vendorsPagination.page} totalPages={vendorsPagination.totalPages} />
          </div>
        )}
      </div>
    </Shell>
  );
}
