"use client";

import { useActionState } from "react";
import { documentReviewAction } from "@/app/actions/dept";
import { REJECTION_REASON_ORDER, REJECTION_REASON_LABEL } from "@/lib/constants";

export default function DocumentActions({
  documentId, mode, sections,
}: { documentId: string; mode: "rail" | "bottom"; sections?: { heading: string }[] }) {
  const [state, action, pending] = useActionState(documentReviewAction, null as { error?: string; ok?: string } | null);

  const sectionPicker = sections && sections.length > 0 ? (
    <select
      name="sectionIndex" defaultValue=""
      style={{ width: "100%", padding: "6px 8px", fontSize: 12, marginBottom: 8, border: "1px solid var(--border-strong)", borderRadius: "var(--radius-sm)", background: "var(--panel)", color: "var(--ink)" }}
    >
      <option value="">— No specific clause —</option>
      {sections.map((s, i) => <option key={i} value={i}>{s.heading}</option>)}
    </select>
  ) : null;

  if (mode === "rail") {
    return (
      <form action={action}>
        <input type="hidden" name="documentId" value={documentId} />
        {sectionPicker}
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
        <label>Reason category <span className="muted">(used for rework analytics when rejecting / requesting changes)</span></label>
        <select name="reason" defaultValue="" style={{ width: "100%", padding: "8px 10px", fontSize: 13, border: "1px solid var(--border-strong)", borderRadius: "var(--radius-sm)", background: "var(--panel)", color: "var(--ink)" }}>
          <option value="">— Select a reason —</option>
          {REJECTION_REASON_ORDER.map((r) => (
            <option key={r} value={r}>{REJECTION_REASON_LABEL[r]}</option>
          ))}
        </select>
      </div>
      {sectionPicker ? (
        <div className="field" style={{ maxWidth: 480 }}>
          <label>Clause <span className="muted">(optional — which section this is about)</span></label>
          {sectionPicker}
        </div>
      ) : null}
      <div className="field" style={{ maxWidth: 480 }}>
        <label>Comment <span className="muted">(required to reject / ask for clarification)</span></label>
        <textarea name="comment" placeholder="Explain the issue, or what you'd like the vendor to clarify…" />
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, margin: "8px 0" }}>
        <input type="checkbox" name="needsResubmission" /> Needs resubmission (lets the vendor re-upload — only applies to Ask for clarification)
      </label>
      {state?.error ? <div className="alert bad">{state.error}</div> : null}
      {state?.ok ? <div className="alert good">{state.ok}</div> : null}
      <div className="btn-row">
        <button className="btn primary" name="intent" value="approve" disabled={pending}>Approve</button>
        <button className="btn danger" name="intent" value="reject" disabled={pending}>Reject</button>
        <button className="btn ghost" name="intent" value="clarify" disabled={pending}>Ask for clarification</button>
      </div>
    </form>
  );
}
