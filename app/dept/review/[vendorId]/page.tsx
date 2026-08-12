import Link from "next/link";
import { redirect } from "next/navigation";
import Shell from "@/app/components/Shell";
import { Chip, Tracker } from "@/app/components/ui";
import { requireDept } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { pipelineStage } from "@/lib/workflow";
import {
  DEPT_LABEL, DEPT_ORDER, REVIEW_STATUS, REVIEW_TONE, ROLE, VSTATUS, VSTATUS_LABEL, VSTATUS_TONE,
} from "@/lib/constants";
import { fmtDate, fmtDateTime, fmtMoney } from "@/lib/format";
import { slaVisual } from "@/lib/sla";
import { getBuyerCoveredKeys } from "@/lib/vendor";
import ReviewActions from "./ReviewActions";
import DocumentReviewRow from "./DocumentReviewRow";

export default async function ReviewPage({ params }: { params: Promise<{ vendorId: string }> }) {
  const { vendorId } = await params;
  const user = await requireDept();
  const dept = user.department!;

  // Horizontal RBAC: only if THIS dept has a review routed for this vendor.
  // These three queries are mutually independent (only depend on vendorId/dept.id),
  // so fetch them concurrently instead of one round trip at a time.
  const [review, vendor, coveredKeys] = await Promise.all([
    prisma.deptReview.findUnique({
      where: { vendorId_departmentId: { vendorId, departmentId: dept.id } },
    }),
    prisma.vendor.findUnique({
      where: { id: vendorId },
      include: {
        deptReviews: { include: { department: true } },
        comments: { include: { author: true }, orderBy: { createdAt: "asc" } },
        documents: { include: { documentType: true } },
      },
    }),
    // Documents the buyer already provided their own copy of (e.g. MSA/NDA sent at invite time).
    getBuyerCoveredKeys(vendorId),
  ]);
  if (!review) redirect("/unauthorized");
  if (!vendor) redirect("/unauthorized");
  // Halted onboardings are invisible to departments entirely, not just read-only.
  if (vendor.status === VSTATUS.HALTED) redirect("/unauthorized");

  // Only this department's routed documents.
  const myDocs = vendor.documents.filter(
    (d) => d.documentType.departmentKey === dept.key && !coveredKeys.has(d.documentType.key)
  );

  const canFlag =
    review.status !== REVIEW_STATUS.FLAGGED &&
    ![VSTATUS.ONBOARDED, VSTATUS.REJECTED].includes(vendor.status as never);
  const halted = vendor.status === VSTATUS.HALTED;
  const sla = slaVisual(review.slaStartedAt, review.slaDueAt, review.slaState);

  return (
    <Shell
      active={user.role === ROLE.ADMIN ? "procurement" : "queue"}
      title={`Review — ${vendor.name}`}
      crumbs={<><Link href="/dept">Review Queue</Link><span className="crumb-sep">/</span>{vendor.name}</>}
    >
      <div className="page-head">
        <div>
          <h1>{vendor.name}</h1>
          <p>{DEPT_LABEL[dept.key]} review · vendor-entered data is read-only.</p>
        </div>
        <Chip tone={VSTATUS_TONE[vendor.status]}>{VSTATUS_LABEL[vendor.status]}</Chip>
      </div>

      <div className="card card-pad">
        <div className="section-label">Overall progress</div>
        <Tracker stage={pipelineStage(vendor.status)} breached={halted} />
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 18 }}>
          {DEPT_ORDER.map((k) => {
            const r = vendor.deptReviews.find((x) => x.department.key === k);
            if (!r) return null;
            return (
              <span key={k} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
                <b>{DEPT_LABEL[k]}:</b> <Chip tone={REVIEW_TONE[r.status]}>{r.status.replace(/_/g, " ").toLowerCase()}</Chip>
              </span>
            );
          })}
        </div>
      </div>

      <div className="split" style={{ marginTop: 18 }}>
        <div className="card card-pad">
          <div className="section-label">Vendor details (read-only)</div>
          <dl className="dl-grid">
            <dt>Legal name</dt><dd>{vendor.legalName ?? vendor.name}</dd>
            <dt>Address</dt><dd>{vendor.address ?? "—"}</dd>
            <dt>Phone</dt><dd>{vendor.phone ?? "—"}</dd>
            <dt>Bank</dt><dd>{vendor.bankAccount ?? "—"}</dd>
            <dt>Contact</dt><dd>{vendor.contactPerson ?? "—"}</dd>
            <dt>GSTIN</dt><dd>{vendor.gstin ?? "—"}</dd>
            <dt>Turnover</dt><dd>{fmtMoney(vendor.turnover)}</dd>
            <dt>Email</dt><dd>{vendor.companyEmail ?? "—"}</dd>
            <dt>Submitted</dt><dd>{fmtDate(vendor.submittedAt)}</dd>
          </dl>
        </div>

        <div>
          <div className="card card-pad">
            <div className="section-label">{DEPT_LABEL[dept.key]} documents</div>
            {myDocs.length === 0 ? (
              <p className="muted" style={{ fontSize: 13 }}>No documents routed to your department.</p>
            ) : (
              myDocs.map((d) => (
                <DocumentReviewRow key={d.id} document={{ ...d, vendorId }} />
              ))
            )}
          </div>

          <div className="card card-pad" style={{ marginTop: 18 }}>
            <div className="section-label">Department status</div>
            <p className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
              Derived from the decisions on the documents above — approve or reject each document individually.
            </p>
            <div style={{ marginBottom: 14 }}>
              <Chip tone={REVIEW_TONE[review.status]}>{review.status.replace(/_/g, " ").toLowerCase()}</Chip>
              {review.comment ? <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>{review.comment}</p> : null}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span className="sub" style={{ fontSize: 11 }}>SLA</span>
              <Chip tone={sla.tone}>{sla.label}</Chip>
            </div>
            <div className="bar-track" style={{ height: 5, marginBottom: 14 }}>
              <div
                className="bar-fill"
                style={{
                  width: `${sla.pct}%`,
                  background: sla.tone === "warn" ? "var(--warn)" : sla.tone === "bad" ? "var(--bad)" : sla.tone === "neutral" ? "var(--ink-faint)" : "var(--good)",
                }}
              />
            </div>
            {canFlag ? <ReviewActions vendorId={vendor.id} disabled={halted} /> : (
              <p className="muted" style={{ fontSize: 13 }}>No further actions available for this vendor&apos;s current state.</p>
            )}
          </div>
        </div>
      </div>

      {vendor.comments.length > 0 ? (
        <div className="card card-pad" style={{ marginTop: 18 }}>
          <div className="section-label">Comments &amp; clarifications</div>
          {vendor.comments.map((c) => (
            <div className="comment" key={c.id}>
              <div className="who2">{c.author.name} <span className="role">· {c.kind.toLowerCase()}</span></div>
              <div className="when">{fmtDateTime(c.createdAt)}</div>
              <div className="body">{c.body}</div>
            </div>
          ))}
        </div>
      ) : null}
    </Shell>
  );
}
