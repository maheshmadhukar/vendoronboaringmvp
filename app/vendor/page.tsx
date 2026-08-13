import Link from "next/link";
import Shell from "@/app/components/Shell";
import { Chip, Tracker, Alert } from "@/app/components/ui";
import { requireVendor } from "@/lib/session";
import { getVendorFull, openClarificationDocIds } from "@/lib/vendor";
import { pipelineStage } from "@/lib/workflow";
import {
  DEPT_LABEL, DEPT_ORDER, VSTATUS, VSTATUS_LABEL, VSTATUS_TONE,
  REVIEW_STATUS, REVIEW_TONE, DOC_STATUS,
} from "@/lib/constants";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { slaVisual } from "@/lib/sla";
import { paginate } from "@/lib/paginate";
import Pagination from "@/app/components/Pagination";
import ReplyForm from "./ReplyForm";
import DocUploadRow from "./documents/DocUploadRow";

type SearchParams = { commentsPage?: string };

export default async function VendorOverview({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireVendor();
  const sp = await searchParams;
  const vendor = await getVendorFull(user.vendorId!);
  if (!vendor) return null;
  const commentsPagination = paginate(vendor.comments, Number(sp.commentsPage) || 1);

  const preSubmit = vendor.status === VSTATUS.DRAFT || vendor.status === VSTATUS.INVITED;
  const openClarification = openClarificationDocIds(vendor.comments);
  const flaggedDocs = vendor.documents.filter(
    (d) => d.status === DOC_STATUS.CHANGES_REQUESTED || openClarification.has(d.id)
  );
  const uploadEditable = vendor.status !== VSTATUS.HALTED;

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

      {flaggedDocs.length > 0 ? (
        <div className="card card-pad" style={{ marginTop: 18 }}>
          <div className="section-label">Documents that require attention</div>
          {flaggedDocs.map((d) => (
            <DocUploadRow
              key={d.id}
              doc={{
                id: d.documentTypeId,
                name: d.documentType.name,
                accepted: d.documentType.acceptedFormats,
                maxMb: d.documentType.maxSizeMb,
                helper: d.documentType.helperText,
                dept: DEPT_LABEL[d.documentType.departmentKey],
              }}
              current={{ id: d.id, filename: d.filename, status: d.status, reviewNote: d.reviewNote }}
              editable={uploadEditable && d.status === DOC_STATUS.CHANGES_REQUESTED}
              comment={
                vendor.comments
                  .filter((c) => c.documentId === d.id && (c.kind === "REJECT" || c.kind === "CLARIFICATION"))
                  .at(-1) ?? null
              }
              needsClarification={openClarification.has(d.id)}
            />
          ))}
        </div>
      ) : null}

      <div className="card card-pad" style={{ marginTop: 18 }}>
        <div className="section-label">Department review status</div>
        {vendor.deptReviews.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>Not submitted yet.</p>
        ) : (
          <ul className="list-reset" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {DEPT_ORDER.map((k) => {
              const r = vendor.deptReviews.find((x) => x.department.key === k);
              if (!r) return null;
              const approved = r.status === REVIEW_STATUS.APPROVED;
              const sla = slaVisual(r.slaStartedAt, r.slaDueAt, r.slaState);
              return (
                <li
                  key={k}
                  style={{ display: "grid", gridTemplateColumns: "1fr auto 120px", alignItems: "center", gap: 12 }}
                >
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{DEPT_LABEL[k]}</span>
                  <Chip tone={REVIEW_TONE[r.status]}>{r.status.replace(/_/g, " ").toLowerCase()}</Chip>
                  <div style={{ textAlign: "right" }}>
                    {approved ? (
                      <span className="sub" style={{ fontSize: 10.5 }}>{fmtDate(r.updatedAt)}</span>
                    ) : (
                      <Chip tone={sla.tone}>{sla.label}</Chip>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {vendor.comments.length > 0 ? (
        <div className="card card-pad" style={{ marginTop: 18 }}>
          <div className="section-label">Clarification history</div>
          {commentsPagination.pageItems.map((c) => (
            <div className="comment" key={c.id}>
              <div className="who2">{c.author.name} <span className="role">· {c.kind.toLowerCase()}</span></div>
              <div className="when">{fmtDateTime(c.createdAt)}</div>
              <div className="body">{c.body}</div>
            </div>
          ))}
          <Pagination paramKey="commentsPage" page={commentsPagination.page} totalPages={commentsPagination.totalPages} />
          <ReplyForm departmentId={vendor.comments[vendor.comments.length - 1].departmentId} />
        </div>
      ) : null}
    </Shell>
  );
}
