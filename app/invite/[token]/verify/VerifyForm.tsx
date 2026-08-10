"use client";

import { useActionState } from "react";
import { verifyOtpAction } from "@/app/actions/invite";

export default function VerifyForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(verifyOtpAction, null as { error?: string } | null);
  return (
    <form action={action}>
      <input type="hidden" name="token" value={token} />
      <div className="field">
        <label>One-time code</label>
        <input name="code" inputMode="numeric" placeholder="6-digit code" autoComplete="one-time-code" />
      </div>
      {state?.error ? <div className="alert bad" style={{ marginBottom: 14 }}>{state.error}</div> : null}
      <button className="btn primary" style={{ width: "100%" }} disabled={pending}>
        {pending ? "Verifying…" : "Verify & continue"}
      </button>
    </form>
  );
}
