"use client";

import { useActionState } from "react";
import { createDocumentType } from "@/app/actions/admin";

export default function AddDocumentTypeForm({ depts, formats }: { depts: { id: string; label: string }[]; formats: string[] }) {
  const [state, action, pending] = useActionState(createDocumentType, null as { error?: string; ok?: string } | null);
  return (
    <form action={action} style={{ display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap" }}>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>Document name</label>
        <input name="name" placeholder="e.g. Insurance Certificate" style={{ width: 220 }} />
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>Routed to</label>
        <select name="departmentId" style={{ fontSize: 13, padding: "9px 11px" }}>
          {depts.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select>
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>Format</label>
        <select name="format" defaultValue="doc" style={{ fontSize: 13, padding: "9px 11px" }}>
          {formats.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>Max MB</label>
        <input name="maxSizeMb" type="number" defaultValue={5} min={1} style={{ width: 80 }} />
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, marginBottom: 9 }}>
        <input type="checkbox" name="mandatory" defaultChecked /> Mandatory
      </label>
      <button className="btn sm primary" disabled={pending}>{pending ? "Adding…" : "Add document type"}</button>
      {state?.error ? <span className="sub" style={{ color: "var(--bad)" }}>{state.error}</span> : null}
      {state?.ok ? <span className="sub" style={{ color: "var(--good)" }}>{state.ok}</span> : null}
    </form>
  );
}
