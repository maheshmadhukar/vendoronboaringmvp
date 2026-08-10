"use client";

import { useActionState } from "react";
import { reviewAction } from "@/app/actions/dept";

export default function ReviewActions({ vendorId, disabled }: { vendorId: string; disabled?: boolean }) {
  const [state, action, pending] = useActionState(reviewAction, null as { error?: string; ok?: string } | null);

  if (disabled) {
    return <div className="alert warn"><span>Onboarding is halted by the admin — no actions can be taken.</span></div>;
  }

  return (
    <form action={action}>
      <input type="hidden" name="vendorId" value={vendorId} />
      <div className="field">
        <label>Comment <span className="muted">(required to reject / request changes / flag)</span></label>
        <textarea name="comment" placeholder="Add your review comment…" />
      </div>
      {state?.error ? <div className="alert bad">{state.error}</div> : null}
      {state?.ok ? <div className="alert good">{state.ok}</div> : null}
      <div className="btn-row" style={{ marginTop: 4 }}>
        <button className="btn primary" name="intent" value="approve" disabled={pending}>Approve</button>
        <button className="btn" name="intent" value="changes" disabled={pending}>Request changes</button>
        <button className="btn danger" name="intent" value="reject" disabled={pending}>Reject</button>
        <button className="btn ghost" name="intent" value="flag" disabled={pending}>Flag to admin</button>
      </div>
    </form>
  );
}
