import Link from "next/link";
import { redirect } from "next/navigation";
import Shell from "@/app/components/Shell";
import { requireVendor } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getDocumentContent, isRichDocType, linkedSectionIndex } from "@/lib/documentContent";
import { openClarificationDocIds } from "@/lib/vendor";
import ReplyForm from "@/app/vendor/ReplyForm";

const docTone: Record<string, string> = {
  PENDING: "neutral", SUBMITTED: "info", APPROVED: "good", REJECTED: "bad", CHANGES_REQUESTED: "warn",
};

export default async function VendorDocumentPage({ params }: { params: Promise<{ documentId: string }> }) {
  const user = await requireVendor();
  const { documentId } = await params;

  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: { documentType: true, vendor: true },
  });
  if (!document || document.vendorId !== user.vendorId) redirect("/unauthorized");

  const comments = await prisma.comment.findMany({
    where: { documentId },
    include: { author: true },
    orderBy: { createdAt: "asc" },
  });

  const content = getDocumentContent(document.documentType.key, document.vendor);
  const rich = isRichDocType(document.documentType.key);
  const linkedIndex = rich && content.kind === "rich" ? linkedSectionIndex(comments, content.sections.length) : null;
  const departmentId = comments.length > 0 ? comments[comments.length - 1].departmentId : null;
  const needsClarification = openClarificationDocIds(comments).has(document.id);
  const displayStatus = document.status === "SUBMITTED" && needsClarification ? "CLARIFICATION_REQUESTED" : document.status;
  const displayTone = document.status === "SUBMITTED" && needsClarification ? "warn" : docTone[document.status] ?? "neutral";

  const commentThread = (
    <div className="comment-rail">
      <h5>Comments</h5>
      {comments.length === 0 ? (
        <p className="muted" style={{ fontSize: 12, marginBottom: 8 }}>No comments yet.</p>
      ) : (
        comments.map((c) => (
          <div className="comment" key={c.id}>
            <div className="who2">{c.author.name} <span className="role">· {c.kind.toLowerCase()}</span></div>
            <div className="body">{c.body}</div>
          </div>
        ))
      )}
      <ReplyForm departmentId={departmentId} documentId={document.id} />
    </div>
  );

  return (
    <Shell
      active="docs"
      title={`${document.documentType.name} — Document`}
      crumbs={
        <>
          <Link href="/vendor/documents">Documents</Link><span className="crumb-sep">/</span>
          {document.documentType.name}
        </>
      }
    >
      <div className="page-head">
        <div>
          <h1>{document.documentType.name}</h1>
          <p>{document.filename ?? "not uploaded"} · read-only</p>
        </div>
        <span className={`chip ${displayTone}`}>{displayStatus.replace(/_/g, " ").toLowerCase()}</span>
      </div>

      {rich && content.kind === "rich" ? (
        <div className="doc-layout">
          <div className="doc-paper">
            {content.sections.map((s, i) => (
              <div key={i}>
                <h6>{s.heading}</h6>
                {i === linkedIndex ? (
                  <p>
                    <span className="doc-highlight">
                      {s.body}
                      <span className="marker">1</span>
                    </span>
                  </p>
                ) : (
                  <p>{s.body}</p>
                )}
              </div>
            ))}
          </div>
          {commentThread}
        </div>
      ) : content.kind === "simple" ? (
        <div className="simple-doc-layout">
          <div>
            <div className="doc-preview" />
            <p className="doc-preview-name">{content.previewLabel}</p>
          </div>
          <div>
            <dl className="field-list">
              {content.fields.map((f, i) => (
                <div key={i}>
                  <dt>{f.label}</dt>
                  <dd style={f.tone === "warn" ? { color: "var(--warn)" } : f.tone === "bad" ? { color: "var(--bad)" } : undefined}>{f.value}</dd>
                </div>
              ))}
              <div>
                <dt>Verification</dt>
                <dd><span className={`chip ${content.verification.tone}`}>{content.verification.tone === "good" ? "Verified" : "Flagged"}</span> — {content.verification.text}</dd>
              </div>
            </dl>
            <div style={{ marginTop: 18 }}>{commentThread}</div>
          </div>
        </div>
      ) : null}
    </Shell>
  );
}
