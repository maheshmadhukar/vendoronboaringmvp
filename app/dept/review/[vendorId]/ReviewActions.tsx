"use client";

import { useActionState } from "react";
import { flagVendor } from "@/app/actions/dept";

/** Department-wide escalation to admin — separate from per-document decisions. */
export default function ReviewActions({ vendorId, disabled }: { vendorId: string; disabled?: boolean }) {
  const [state, action, pending] = useActionState(flagVendor, null as { error?: string; ok?: string } | null);

  if (disabled) {
    return <div className="alert warn"><span>Onboarding is halted by the admin — no actions can be taken.</span></div>;
  }

  return (
    <form action={action}>
      <input type="hidden" name="vendorId" value={vendorId} />
      <div className="field">
        <label>Comment <span className="muted">(required to flag)</span></label>
        <textarea name="comment" placeholder="Describe the issue you're escalating…" />
      </div>
      {state?.error ? <div className="alert bad">{state.error}</div> : null}
      {state?.ok ? <div className="alert good">{state.ok}</div> : null}
      <div className="btn-row" style={{ marginTop: 4 }}>
        <button className="btn ghost" disabled={pending}>Flag to admin</button>
      </div>
    </form>
  );
}
