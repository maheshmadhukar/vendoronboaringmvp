import Link from "next/link";
import { redirect } from "next/navigation";
import Shell from "@/app/components/Shell";
import { loadOwnedDocument } from "@/lib/dept";
import { prisma } from "@/lib/prisma";
import { getDocumentContent, isRichDocType } from "@/lib/documentContent";
import { VSTATUS } from "@/lib/constants";
import DocumentActions from "./DocumentActions";

const docTone: Record<string, string> = {
  PENDING: "neutral", SUBMITTED: "info", APPROVED: "good", REJECTED: "bad", CHANGES_REQUESTED: "warn",
};

export default async function DocumentPage({ params }: { params: Promise<{ vendorId: string; documentId: string }> }) {
  const { vendorId, documentId } = await params;
  const { document } = await loadOwnedDocument(documentId);
  if (document.vendorId !== vendorId) redirect("/unauthorized");

  const comments = await prisma.comment.findMany({
    where: { documentId },
    include: { author: true },
    orderBy: { createdAt: "asc" },
  });

  const content = getDocumentContent(document.documentType.key, document.vendor);
  const rich = isRichDocType(document.documentType.key);
  const halted = document.vendor.status === VSTATUS.HALTED;
  const actionable = !halted && document.status !== "APPROVED" && document.status !== "REJECTED";

  return (
    <Shell
      active="queue"
      title={`${document.documentType.name} — Document Review`}
      crumbs={
        <>
          <Link href="/dept">Review Queue</Link><span className="crumb-sep">/</span>
          <Link href={`/dept/review/${vendorId}`}>{document.vendor.name}</Link><span className="crumb-sep">/</span>
          {document.documentType.name}
        </>
      }
    >
      <div className="page-head">
        <div>
          <h1>{document.documentType.name}</h1>
          <p>{document.vendor.name} · {document.filename ?? "not uploaded"}</p>
        </div>
        <span className={`chip ${docTone[document.status] ?? "neutral"}`}>{document.status.replace(/_/g, " ").toLowerCase()}</span>
      </div>

      {document.reviewNote ? <div className="alert warn" style={{ marginBottom: 18 }}>{document.reviewNote}</div> : null}

      {rich && content.kind === "rich" ? (
        <>
          <div className="ai-note">
            <span className="ai-badge">✦ AI</span>
            <ul className="ai-risks">
              {content.aiRisks.map((r, i) => <li key={i} className={r.tone}>{r.text}</li>)}
            </ul>
          </div>

          <div className="doc-layout">
            <div className="doc-paper">
              {content.sections.map((s, i) => (
                <div key={i}>
                  <h6>{s.heading}</h6>
                  {s.highlight ? (
                    <p>
                      <span className="doc-highlight">
                        {s.highlight}
                        <span className="marker">1</span>
                      </span>
                      {s.body.slice(s.body.indexOf(s.highlight) + s.highlight.length)}
                    </p>
                  ) : (
                    <p>{s.body}</p>
                  )}
                </div>
              ))}
            </div>

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
              {actionable ? <DocumentActions documentId={document.id} mode="rail" /> : null}
            </div>
          </div>
        </>
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
            {comments.length > 0 ? (
              <div style={{ marginTop: 18 }}>
                {comments.map((c) => (
                  <div className="comment" key={c.id}>
                    <div className="who2">{c.author.name} <span className="role">· {c.kind.toLowerCase()}</span></div>
                    <div className="body">{c.body}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {actionable ? <DocumentActions documentId={document.id} mode="bottom" /> : (
        halted ? <div className="alert warn" style={{ marginTop: 18 }}>Onboarding is halted by the admin — no actions can be taken.</div> : null
      )}
    </Shell>
  );
}
