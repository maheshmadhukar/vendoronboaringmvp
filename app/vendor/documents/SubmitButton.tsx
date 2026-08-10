"use client";

import { useActionState } from "react";
import { submitApplication } from "@/app/actions/vendor";

export default function SubmitButton({ canSubmit }: { canSubmit: boolean }) {
  const [state, action, pending] = useActionState(
    async () => submitApplication(),
    null as { error?: string; ok?: string } | null
  );
  return (
    <form action={action}>
      {state?.error ? <div className="alert bad">{state.error}</div> : null}
      {state?.ok ? <div className="alert good">{state.ok}</div> : null}
      <button className="btn primary" disabled={pending || !canSubmit}>
        {pending ? "Submitting…" : "Submit application for review"}
      </button>
      {!canSubmit ? <span className="btn-note" style={{ marginLeft: 10 }}>Upload all mandatory documents to enable submit.</span> : null}
    </form>
  );
}
