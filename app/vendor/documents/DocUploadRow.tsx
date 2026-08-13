"use client";

import Link from "next/link";
import { useActionState } from "react";
import { uploadDocument } from "@/app/actions/vendor";
import { Chip } from "@/app/components/ui";
import CheckIssueLink from "@/app/components/CheckIssueLink";

const tone: Record<string, string> = {
  PENDING: "neutral", SUBMITTED: "info", APPROVED: "good", REJECTED: "bad", CHANGES_REQUESTED: "warn",
};

type Doc = { id: string; name: string; accepted: string; maxMb: number; helper?: string | null; dept: string };
type Cur = { id: string; filename?: string | null; status: string; reviewNote?: string | null } | null;
type IssueComment = { id: string; author: { name: string }; kind: string; createdAt: Date; body: string };

export default function DocUploadRow({
  doc, current, editable, comment = null, needsClarification = false, preSubmit = false,
}: {
  doc: Doc; current: Cur; editable: boolean; comment?: IssueComment | null;
  needsClarification?: boolean; preSubmit?: boolean;
}) {
  const [state, action, pending] = useActionState(uploadDocument, null as { error?: string; ok?: string } | null);
  const status = current?.status ?? "PENDING";
  // Before the vendor's one-shot Submit, an uploaded document is only saved
  // to their own draft — nothing has gone to the buyer yet, so don't call it
  // "submitted" even though that's the underlying Document.status value. Once
  // submitted, a document waiting on a reply to an open department question
  // reads "clarification requested" instead of "submitted" too.
  const displayStatus =
    status === "SUBMITTED" && preSubmit ? "UPLOADED"
    : status === "SUBMITTED" && needsClarification ? "CLARIFICATION_REQUESTED"
    : status;
  const displayTone =
    status === "SUBMITTED" && preSubmit ? "neutral"
    : status === "SUBMITTED" && needsClarification ? "warn"
    : tone[status] ?? "neutral";
  return (
    <div style={{ padding: "14px 0", borderBottom: "1px solid var(--border)" }}>
      <div className="doc-row" style={{ border: "none", padding: 0 }}>
        <div className="doc-ico" />
        <div className="doc-info">
          <div className="doc-name">{doc.name}</div>
          <div className="doc-meta">{doc.dept} · accepted: {doc.accepted} · max {doc.maxMb}MB {current?.filename ? `· ${current.filename}` : ""}</div>
          {comment ? <CheckIssueLink docName={doc.name} comment={comment} /> : null}
          {doc.helper ? <div className="doc-meta">{doc.helper}</div> : null}
        </div>
        {current ? (
          <Link href={`/vendor/documents/${current.id}`} aria-label="View document" title="View document" className="btn sm ghost" style={{ padding: "5px 8px" }}>
            👁
          </Link>
        ) : null}
        <Chip tone={displayTone}>{displayStatus.replace(/_/g, " ").toLowerCase()}</Chip>
      </div>
      {editable ? (
        <form action={action} style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, marginLeft: 46 }}>
          <input type="hidden" name="documentTypeId" value={doc.id} />
          <input type="file" name="file" style={{ fontSize: 12 }} />
          <button className="btn sm" disabled={pending}>{pending ? "Uploading…" : current?.filename ? "Replace" : "Upload"}</button>
          {state?.error ? <span style={{ color: "var(--bad)", fontSize: 12 }}>{state.error}</span> : null}
          {state?.ok ? <span style={{ color: "var(--good)", fontSize: 12 }}>Uploaded ✓</span> : null}
        </form>
      ) : null}
    </div>
  );
}
