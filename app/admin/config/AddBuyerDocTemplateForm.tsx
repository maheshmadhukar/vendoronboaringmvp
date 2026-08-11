"use client";

import { useActionState } from "react";
import { createBuyerDocTemplate } from "@/app/actions/admin";

export default function AddBuyerDocTemplateForm({ depts }: { depts: { id: string; label: string }[] }) {
  const [state, action, pending] = useActionState(createBuyerDocTemplate, null as { error?: string; ok?: string } | null);
  return (
    <form action={action} style={{ display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap" }}>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>Document name</label>
        <input name="name" placeholder="e.g. Service Level Agreement" style={{ width: 220 }} />
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>Routed to</label>
        <select name="departmentId" style={{ fontSize: 13, padding: "9px 11px" }}>
          {depts.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select>
      </div>
      <button className="btn sm primary" disabled={pending}>{pending ? "Adding…" : "Add template"}</button>
      {state?.error ? <span className="sub" style={{ color: "var(--bad)" }}>{state.error}</span> : null}
      {state?.ok ? <span className="sub" style={{ color: "var(--good)" }}>{state.ok}</span> : null}
    </form>
  );
}
