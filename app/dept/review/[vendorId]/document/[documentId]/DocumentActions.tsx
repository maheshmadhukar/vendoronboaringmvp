"use client";

import { useActionState } from "react";
import { documentReviewAction } from "@/app/actions/dept";

export default function DocumentActions({ documentId, mode }: { documentId: string; mode: "rail" | "bottom" }) {
  const [state, action, pending] = useActionState(documentReviewAction, null as { error?: string; ok?: string } | null);

  if (mode === "rail") {
    return (
      <form action={action}>
        <input type="hidden" name="documentId" value={documentId} />
        <textarea name="comment" placeholder="Write a comment…" rows={2} style={{ width: "100%", fontSize: 12.5, marginBottom: 8 }} />
        {state?.error ? <div className="alert bad" style={{ fontSize: 11.5, padding: 8 }}>{state.error}</div> : null}
        {state?.ok ? <div className="alert good" style={{ fontSize: 11.5, padding: 8 }}>{state.ok}</div> : null}
        <button className="btn ghost" style={{ width: "100%", marginTop: 6, padding: "7px 10px", fontSize: 11 }} name="intent" value="comment" disabled={pending}>
          + Add comment
        </button>
        <button className="btn ghost" style={{ width: "100%", marginTop: 8, padding: "7px 10px", fontSize: 11 }} name="intent" value="clarify" disabled={pending}>
          Get clarification from vendor
        </button>
      </form>
    );
  }

  return (
    <form action={action} style={{ marginTop: 18 }}>
      <input type="hidden" name="documentId" value={documentId} />
      <div className="field" style={{ maxWidth: 480 }}>
        <label>Reason <span className="muted">(required to reject / request changes)</span></label>
        <textarea name="comment" placeholder="Explain what needs to change before this can be resubmitted…" />
      </div>
      {state?.error ? <div className="alert bad">{state.error}</div> : null}
      {state?.ok ? <div className="alert good">{state.ok}</div> : null}
      <div className="btn-row">
        <button className="btn primary" name="intent" value="approve" disabled={pending}>Approve</button>
        <button className="btn ghost" name="intent" value="changes" disabled={pending}>Request changes</button>
        <button className="btn danger" name="intent" value="reject" disabled={pending}>Reject</button>
      </div>
    </form>
  );
}
