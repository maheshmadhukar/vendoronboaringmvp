"use client";

import { useActionState } from "react";
import { updateDeptManagerEmail } from "@/app/actions/admin";

export default function EditManagerEmailForm({ userId, currentEmail }: { userId: string; currentEmail: string }) {
  const [state, action, pending] = useActionState(updateDeptManagerEmail, null as { error?: string; ok?: string } | null);
  return (
    <form action={action} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <input type="hidden" name="userId" value={userId} />
      <input name="email" type="email" required defaultValue={currentEmail} style={{ width: 200 }} />
      <button className="btn sm" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
      {state?.error ? <span className="alert bad" style={{ padding: "2px 8px", fontSize: 12 }}>{state.error}</span> : null}
      {state?.ok ? <span className="alert good" style={{ padding: "2px 8px", fontSize: 12 }}>Saved</span> : null}
    </form>
  );
}
