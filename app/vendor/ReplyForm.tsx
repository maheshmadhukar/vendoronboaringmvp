"use client";

import { useActionState } from "react";
import { replyToComment } from "@/app/actions/vendor";

export default function ReplyForm({ departmentId }: { departmentId: string | null }) {
  const [state, action, pending] = useActionState(replyToComment, null as { error?: string; ok?: string } | null);
  return (
    <form action={action} style={{ marginTop: 14 }}>
      <input type="hidden" name="departmentId" value={departmentId ?? ""} />
      <textarea name="body" placeholder="Write a reply…" rows={2} style={{ width: "100%", fontSize: 13 }} />
      {state?.error ? <div className="alert bad" style={{ marginTop: 8 }}>{state.error}</div> : null}
      {state?.ok ? <div className="alert good" style={{ marginTop: 8 }}>{state.ok}</div> : null}
      <button className="btn sm primary" style={{ marginTop: 8 }} disabled={pending}>{pending ? "Sending…" : "Send reply"}</button>
    </form>
  );
}
