import Link from "next/link";
import Shell from "@/app/components/Shell";
import { Chip, Empty } from "@/app/components/ui";
import { requireDept } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/workflow";
import { DEPT_LABEL, REVIEW_STATUS, REVIEW_TONE, VSTATUS } from "@/lib/constants";
import { fmtDate } from "@/lib/format";
import { isBreached, slaVisual } from "@/lib/sla";

export default async function DeptQueue() {
  const user = await requireDept();
  const dept = user.department!;

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

  return (
    <Shell active="queue" title={`${DEPT_LABEL[dept.key]} — Review Queue`}>
      <div className="page-head">
        <div>
          <h1>{DEPT_LABEL[dept.key]} Review Queue</h1>
          <p>Vendors routed to your department. You review only {DEPT_LABEL[dept.key]} documents; other departments handle theirs.</p>
        </div>
      </div>

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
