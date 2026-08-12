import Link from "next/link";
import { redirect } from "next/navigation";
import Shell from "@/app/components/Shell";
import { Chip, Tracker } from "@/app/components/ui";
import DeptDocumentsModal from "./DeptDocumentsModal";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getConfig, pipelineStage } from "@/lib/workflow";
import {
  DEPT, DEPT_LABEL, DEPT_ORDER, VSTATUS, VSTATUS_LABEL, VSTATUS_TONE, REVIEW_STATUS, REVIEW_TONE,
} from "@/lib/constants";
import { fmtDate, fmtDateTime, fmtMoney } from "@/lib/format";
import { reviewSlaVisual } from "@/lib/sla";
import { haltVendor, resumeVendor, finalApprove } from "@/app/actions/admin";

export default async function AdminVendor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdmin(); // authorize before any data access (RBAC gate)
  // The three reads below are independent — run them in one parallel batch
  // instead of three serial round-trips to Turso.
  const [cfg, vendor, logs] = await Promise.all([
    getConfig(),
    prisma.vendor.findUnique({
      where: { id },
      include: {
        deptReviews: { include: { department: true } },
        documents: { include: { documentType: true } },
        comments: { include: { author: true }, orderBy: { createdAt: "asc" } },
      },
    }),
    prisma.auditLog.findMany({ where: { targetId: id }, orderBy: { createdAt: "desc" }, take: 10, include: { actor: true } }),
  ]);
  if (!vendor) redirect("/admin");

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
            (() => {
              const shownReviews = vendor.deptReviews.filter((r) => r.department.key !== DEPT.PROCUREMENT);
              const timelineStart = shownReviews[0]?.slaStartedAt ?? null;
              const timelineEnd = shownReviews.reduce(
                (max, r) => (r.slaDueAt && (!max || r.slaDueAt > max) ? r.slaDueAt : max),
                null as Date | null
              );
              function pctOfTimeline(d: Date | null): number {
                if (!timelineStart || !timelineEnd || !d) return 0;
                const total = timelineEnd.getTime() - timelineStart.getTime();
                if (total <= 0) return 100;
                return Math.min(100, Math.max(0, ((d.getTime() - timelineStart.getTime()) / total) * 100));
              }
              const todayPct = pctOfTimeline(new Date());

              return DEPT_ORDER.filter((k) => k !== DEPT.PROCUREMENT).map((k) => {
                const r = vendor.deptReviews.find((x) => x.department.key === k);
                if (!r) return null;
                const sla = reviewSlaVisual(r);
                const trackPct = pctOfTimeline(r.slaDueAt);
                return (
                <div key={k} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div><b style={{ fontSize: 13 }}>{DEPT_LABEL[k]}</b>{r.comment ? <div className="sub">{r.comment}</div> : null}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <DeptDocumentsModal
                        deptLabel={DEPT_LABEL[k]}
                        vendorId={vendor.id}
                        documents={vendor.documents.filter((d) => d.documentType.departmentKey === k)}
                      />
                      <Chip tone={REVIEW_TONE[r.status]}>{r.status.replace(/_/g, " ").toLowerCase()}</Chip>
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                    <span className="sub" style={{ fontSize: 11 }}>SLA: {r.department.slaDays} working days · due {fmtDate(r.slaDueAt)}</span>
                    <Chip tone={sla.tone}>{sla.label}</Chip>
                  </div>
                  <div style={{ position: "relative", marginTop: 14 }}>
                    <span
                      aria-hidden="true"
                      title={`Today — ${fmtDate(new Date())}`}
                      style={{ position: "absolute", top: -12, left: `${todayPct}%`, transform: "translateX(-50%)", fontSize: 10, lineHeight: 1, color: "var(--ink-soft)" }}
                    >
                      ▼
                    </span>
                    <div className="bar-track" style={{ height: 5, width: `${trackPct}%` }}>
                      <div
                        className="bar-fill"
                        style={{
                          width: `${sla.pct}%`,
                          background: sla.tone === "warn" ? "var(--warn)" : sla.tone === "bad" ? "var(--bad)" : sla.tone === "neutral" ? "var(--ink-faint)" : "var(--good)",
                        }}
                      />
                    </div>
                  </div>
                </div>
                );
              });
            })()}
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
