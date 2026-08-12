"use client";

import { useActionState } from "react";
import { uploadDocument } from "@/app/actions/vendor";
import { Chip } from "@/app/components/ui";
import CheckIssueLink from "@/app/components/CheckIssueLink";

const tone: Record<string, string> = {
  PENDING: "neutral", SUBMITTED: "info", APPROVED: "good", REJECTED: "bad", CHANGES_REQUESTED: "warn",
};

type Doc = { id: string; name: string; accepted: string; maxMb: number; helper?: string | null; dept: string };
type Cur = { filename?: string | null; status: string; reviewNote?: string | null } | null;
type IssueComment = { id: string; author: { name: string }; kind: string; createdAt: Date; body: string };

export default function DocUploadRow({
  doc, current, editable, comments = [],
}: { doc: Doc; current: Cur; editable: boolean; comments?: IssueComment[] }) {
  const [state, action, pending] = useActionState(uploadDocument, null as { error?: string; ok?: string } | null);
  const status = current?.status ?? "PENDING";
  return (
    <div style={{ padding: "14px 0", borderBottom: "1px solid var(--border)" }}>
      <div className="doc-row" style={{ border: "none", padding: 0 }}>
        <div className="doc-ico" />
        <div className="doc-info">
          <div className="doc-name">{doc.name}</div>
          <div className="doc-meta">{doc.dept} · accepted: {doc.accepted} · max {doc.maxMb}MB {current?.filename ? `· ${current.filename}` : ""}</div>
          {comments.length > 0 ? <CheckIssueLink docName={doc.name} comments={comments} /> : null}
          {doc.helper ? <div className="doc-meta">{doc.helper}</div> : null}
        </div>
        <Chip tone={tone[status] ?? "neutral"}>{status.replace(/_/g, " ").toLowerCase()}</Chip>
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
