"use client";

import { useActionState } from "react";
import { replaceBuyerDocTemplateFile } from "@/app/actions/admin";

export default function BuyerDocTemplateFileCell({
  templateId,
  filename,
  sizeKb,
}: {
  templateId: string;
  filename: string | null;
  sizeKb: number | null;
}) {
  const [state, action, pending] = useActionState(replaceBuyerDocTemplateFile, null as { error?: string; ok?: string } | null);
  return (
    <div>
      <div style={{ fontSize: 12.5 }}>
        {filename ? `${filename}${sizeKb ? ` · ${sizeKb}KB` : ""}` : <span className="muted">No file</span>}
      </div>
      <form action={action} style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
        <input type="hidden" name="id" value={templateId} />
        <input type="file" name="file" style={{ fontSize: 12 }} />
        <button className="btn sm" disabled={pending}>{pending ? "Uploading…" : "Replace"}</button>
      </form>
      {state?.error ? <span style={{ color: "var(--bad)", fontSize: 12 }}>{state.error}</span> : null}
      {state?.ok ? <span style={{ color: "var(--good)", fontSize: 12 }}>Replaced ✓</span> : null}
    </div>
  );
}
