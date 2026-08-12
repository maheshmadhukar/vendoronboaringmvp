import Link from "next/link";
import { redirect } from "next/navigation";
import Shell from "@/app/components/Shell";
import { Chip, Tracker } from "@/app/components/ui";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getConfig, pipelineStage } from "@/lib/workflow";
import {
  DEPT_LABEL, DEPT_ORDER, VSTATUS, VSTATUS_LABEL, VSTATUS_TONE, REVIEW_STATUS, REVIEW_TONE,
} from "@/lib/constants";
import { fmtDate, fmtDateTime, fmtMoney } from "@/lib/format";
import { slaVisual } from "@/lib/sla";
import { haltVendor, resumeVendor, finalApprove, clearFlag } from "@/app/actions/admin";

export default async function AdminVendor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdmin();
  const cfg = await getConfig();
  const vendor = await prisma.vendor.findUnique({
    where: { id },
    include: {
      deptReviews: { include: { department: true } },
      documents: { include: { documentType: true } },
      comments: { include: { author: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!vendor) redirect("/admin");
  const logs = await prisma.auditLog.findMany({ where: { targetId: id }, orderBy: { createdAt: "desc" }, take: 10, include: { actor: true } });

  const allApproved = vendor.deptReviews.length > 0 && vendor.deptReviews.every((r) => r.status === REVIEW_STATUS.APPROVED);
  const terminal = [VSTATUS.ONBOARDED, VSTATUS.REJECTED].includes(vendor.status as never);

  return (
    <Shell active="dashboard" title={vendor.name}
      crumbs={<><Link href="/admin">Status Dashboard</Link><span className="crumb-sep">/</span>{vendor.name}</>}>
      <div className="page-head">
        <div><h1>{vendor.name}</h1><p>{vendor.companyEmail ?? "—"}</p></div>
        <Chip tone={VSTATUS_TONE[vendor.status]}>{VSTATUS_LABEL[vendor.status]}</Chip>
      </div>

      <div className="card card-pad">
        <div className="section-label">Progress</div>
        <Tracker stage={pipelineStage(vendor.status)} breached={vendor.status === VSTATUS.HALTED} />
      </div>

      {/* Admin action panel */}
      <div className="card card-pad" style={{ marginTop: 18 }}>
        <div className="section-label">Admin actions</div>

        {vendor.status === VSTATUS.FINAL_PENDING ? (
          <div style={{ marginBottom: 14 }}>
            <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
              All departments have approved. {cfg.finalApprovalRequired
                ? "Final approval is required to onboard this vendor."
                : "Final approval is currently disabled in config."}
            </p>
            <form action={finalApprove}>
              <input type="hidden" name="vendorId" value={vendor.id} />
              <button className="btn primary" disabled={!allApproved}>Give final approval &amp; onboard</button>
            </form>
          </div>
        ) : null}

        {vendor.status === VSTATUS.FLAGGED ? (
          <form action={clearFlag} style={{ marginBottom: 14 }}>
            <input type="hidden" name="vendorId" value={vendor.id} />
            {vendor.deptReviews.filter((r) => r.status === "FLAGGED").map((r) => (
              <label key={r.id} style={{ display: "block", fontSize: 12.5, marginBottom: 6 }}>
                Extend SLA for {DEPT_LABEL[r.department.key]} by
                <input type="number" name={`extendDays_${r.departmentId}`} defaultValue={0} min={0} style={{ width: 56, margin: "0 6px" }} />
                working days
              </label>
            ))}
            <button className="btn" style={{ marginTop: 4 }}>Clear flag(s) &amp; return to review</button>
          </form>
        ) : null}

        {vendor.status === VSTATUS.HALTED ? (
          <form action={resumeVendor}>
            <input type="hidden" name="vendorId" value={vendor.id} />
            <button className="btn primary">Resume onboarding</button>
          </form>
        ) : !terminal ? (
          <form action={haltVendor}>
            <input type="hidden" name="vendorId" value={vendor.id} />
            <div className="field" style={{ maxWidth: 460 }}>
              <label>Halt reason</label>
              <input name="reason" placeholder="Why are you halting this onboarding?" />
            </div>
            <button className="btn danger">Halt onboarding</button>
          </form>
        ) : (
          <p className="muted" style={{ fontSize: 13 }}>No actions — this onboarding is {VSTATUS_LABEL[vendor.status].toLowerCase()}.</p>
        )}
      </div>

      <div className="split" style={{ marginTop: 18 }}>
        <div className="card card-pad">
          <div className="section-label">Vendor details</div>
          <dl className="dl-grid">
            <dt>Address</dt><dd>{vendor.address ?? "—"}</dd>
            <dt>Phone</dt><dd>{vendor.phone ?? "—"}</dd>
            <dt>Bank</dt><dd>{vendor.bankAccount ?? "—"}</dd>
            <dt>GSTIN</dt><dd>{vendor.gstin ?? "—"}</dd>
            <dt>Turnover</dt><dd>{fmtMoney(vendor.turnover)}</dd>
            <dt>Value</dt><dd>{fmtMoney(vendor.valueAmount)}</dd>
            <dt>Submitted</dt><dd>{fmtDate(vendor.submittedAt)}</dd>
          </dl>
        </div>
        <div className="card card-pad">
          <div className="section-label">Department reviews</div>
          {vendor.deptReviews.length === 0 ? <p className="muted" style={{ fontSize: 13 }}>Not submitted.</p> :
            DEPT_ORDER.map((k) => {
              const r = vendor.deptReviews.find((x) => x.department.key === k);
              if (!r) return null;
              const sla = slaVisual(r.slaStartedAt, r.slaDueAt, r.slaState);
              return (
                <div key={k} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div><b style={{ fontSize: 13 }}>{DEPT_LABEL[k]}</b>{r.comment ? <div className="sub">{r.comment}</div> : null}</div>
                    <Chip tone={REVIEW_TONE[r.status]}>{r.status.replace(/_/g, " ").toLowerCase()}</Chip>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                    <span className="sub" style={{ fontSize: 11 }}>SLA: {r.department.slaDays} working days</span>
                    <Chip tone={sla.tone}>{sla.label}</Chip>
                  </div>
                  <div className="bar-track" style={{ marginTop: 4, height: 5 }}>
                    <div
                      className="bar-fill"
                      style={{
                        width: `${sla.pct}%`,
                        background: sla.tone === "warn" ? "var(--warn)" : sla.tone === "bad" ? "var(--bad)" : sla.tone === "neutral" ? "var(--ink-faint)" : "var(--good)",
                      }}
                    />
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {logs.length > 0 ? (
        <div className="card card-pad" style={{ marginTop: 18 }}>
          <div className="section-label">Audit trail</div>
          {logs.map((l) => (
            <div className="notif" key={l.id}>
              <span>{l.action.replace(/_/g, " ")} — {l.actor?.name ?? "system"}{l.meta ? `: ${l.meta}` : ""}</span>
              <span className="when">{fmtDateTime(l.createdAt)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </Shell>
  );
}
