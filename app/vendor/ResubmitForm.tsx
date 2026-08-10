"use client";

import { useActionState } from "react";
import { resubmitApplication } from "@/app/actions/vendor";

export default function ResubmitForm() {
  const [state, action, pending] = useActionState(resubmitApplication, null as { error?: string; ok?: string } | null);
  return (
    <form action={action}>
      <div className="field">
        <label>Clarification comment <span className="req">*</span></label>
        <textarea name="comment" placeholder="Explain what you changed / re-uploaded…" required />
        <span className="hint">A comment is mandatory when resubmitting.</span>
      </div>
      {state?.error ? <div className="alert bad">{state.error}</div> : null}
      {state?.ok ? <div className="alert good">{state.ok}</div> : null}
      <button className="btn primary" disabled={pending}>{pending ? "Resubmitting…" : "Resubmit to departments"}</button>
    </form>
  );
}
