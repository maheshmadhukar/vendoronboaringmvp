"use client";

import { useActionState } from "react";
import { acceptInviteAction } from "@/app/actions/invite";

export default function InviteForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(acceptInviteAction, null as { error?: string } | null);
  return (
    <form action={action}>
      <input type="hidden" name="token" value={token} />
      <div className="field">
        <label>Create password</label>
        <input name="password" type="password" placeholder="At least 8 characters" autoComplete="new-password" />
      </div>
      <div className="field">
        <label>Confirm password</label>
        <input name="confirm" type="password" placeholder="Re-enter password" autoComplete="new-password" />
      </div>
      {state?.error ? <div className="alert bad" style={{ marginBottom: 14 }}>{state.error}</div> : null}
      <button className="btn primary" style={{ width: "100%" }} disabled={pending}>
        {pending ? "Creating account…" : "Create account & continue"}
      </button>
    </form>
  );
}
