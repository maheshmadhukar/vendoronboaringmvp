import Link from "next/link";
import Shell from "@/app/components/Shell";
import { Chip, Tracker, Alert, Empty } from "@/app/components/ui";
import { requireVendor } from "@/lib/session";
import { getVendorFull } from "@/lib/vendor";
import { pipelineStage } from "@/lib/workflow";
import {
  DEPT_LABEL, DEPT_ORDER, VSTATUS, VSTATUS_LABEL, VSTATUS_TONE,
  REVIEW_STATUS, REVIEW_TONE, DOC_STATUS,
} from "@/lib/constants";
import { fmtDateTime } from "@/lib/format";
import ResubmitForm from "./ResubmitForm";

const docTone: Record<string, string> = {
  PENDING: "neutral", SUBMITTED: "info", APPROVED: "good", REJECTED: "bad", CHANGES_REQUESTED: "warn",
};

export default async function VendorOverview() {
  const user = await requireVendor();
  const vendor = await getVendorFull(user.vendorId!);
  if (!vendor) return null;

  const preSubmit = vendor.status === VSTATUS.DRAFT || vendor.status === VSTATUS.INVITED;
  const changes = vendor.deptReviews.filter((r) => r.status === REVIEW_STATUS.CHANGES_REQUESTED);

  return (
    <Shell active="overview" title="Onboarding Overview">
      <div className="page-head">
        <div>
          <h1>{vendor.name}</h1>
          <p>Track your onboarding — department reviews and document status update in real time.</p>
        </div>
        <Chip tone={VSTATUS_TONE[vendor.status]}>{VSTATUS_LABEL[vendor.status]}</Chip>
      </div>

      <div className="card card-pad">
        <Tracker stage={pipelineStage(vendor.status)} breached={vendor.status === VSTATUS.HALTED} />
      </div>

      {vendor.status === VSTATUS.HALTED ? (
        <Alert tone="bad"><span><b>Onboarding halted.</b> {vendor.haltReason || "The buyer's admin has paused your onboarding. They will be in touch."}</span></Alert>
      ) : null}

      {preSubmit ? (
        <div className="card card-pad" style={{ marginTop: 18 }}>
          <div className="card-title">Finish your application</div>
          <div className="card-sub">Complete your business details and upload all documents, then submit — everything is submitted in one go.</div>
          <div className="btn-row" style={{ marginTop: 4 }}>
            <Link href="/vendor/onboarding" className="btn">1. Business details</Link>
            <Link href="/vendor/documents" className="btn primary">2. Upload &amp; submit documents</Link>
          </div>
        </div>
      ) : null}

      {changes.length > 0 ? (
        <div className="card card-pad" style={{ marginTop: 18 }}>
          <div className="card-title">Changes requested</div>
          <div className="card-sub">
            {changes.map((r) => `${DEPT_LABEL[r.department.key]}: ${r.comment ?? "changes requested"}`).join(" · ")}
          </div>
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
            Re-upload the flagged document(s) in <Link href="/vendor/documents">Documents</Link>, then resubmit with a comment below.
          </p>
          <ResubmitForm />
        </div>
      ) : null}

      <div className="split" style={{ marginTop: 18 }}>
        <div className="card card-pad">
          <div className="section-label">Department review status</div>
          {vendor.deptReviews.length === 0 ? (
            <p className="muted" style={{ fontSize: 13 }}>Not submitted yet.</p>
          ) : (
            <ul className="list-reset" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {DEPT_ORDER.map((k) => {
                const r = vendor.deptReviews.find((x) => x.department.key === k);
                if (!r) return null;
                return (
                  <li key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{DEPT_LABEL[k]}</span>
                    <Chip tone={REVIEW_TONE[r.status]}>{r.status.replace(/_/g, " ").toLowerCase()}</Chip>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="card card-pad">
          <div className="section-label">Document status</div>
          {vendor.documents.length === 0 ? (
            <Empty title="No documents uploaded" hint="Head to Documents to upload your paperwork." />
          ) : (
            <div>
              {vendor.documents.map((d) => (
                <div className="doc-row" key={d.id}>
                  <div className="doc-ico" />
                  <div className="doc-info">
                    <div className="doc-name">{d.documentType.name}</div>
                    <div className="doc-meta">{DEPT_LABEL[d.documentType.departmentKey]} · {d.filename ?? "not uploaded"}</div>
                    {d.reviewNote ? <div className="doc-flag">{d.reviewNote}</div> : null}
                  </div>
                  <Chip tone={docTone[d.status] ?? "neutral"}>{d.status.replace(/_/g, " ").toLowerCase()}</Chip>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {vendor.comments.length > 0 ? (
        <div className="card card-pad" style={{ marginTop: 18 }}>
          <div className="section-label">Clarification history</div>
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
