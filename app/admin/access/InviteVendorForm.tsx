"use client";

import { useActionState } from "react";
import { inviteVendor } from "@/app/actions/admin";

export default function InviteVendorForm({ templates }: { templates: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(
    inviteVendor,
    null as { error?: string; ok?: string; link?: string } | null
  );
  return (
    <form action={action}>
      <div className="form-grid">
        <div className="field">
          <label>Vendor name</label>
          <input name="name" placeholder="Acme Supplies Pvt Ltd" />
        </div>
        <div className="field">
          <label>Work email</label>
          <input name="email" type="email" placeholder="contact@acme.com" />
        </div>
      </div>
      {templates.length > 0 ? (
        <div className="field">
          <label>Buyer documents to send</label>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {templates.map((t) => (
              <label key={t.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 400 }}>
                <input type="checkbox" name="templateIds" value={t.id} defaultChecked /> {t.name}
              </label>
            ))}
          </div>
          <span className="hint">Attached to the vendor as soon as the invite is created.</span>
        </div>
      ) : null}
      {state?.error ? <div className="alert bad">{state.error}</div> : null}
      {state?.ok ? (
        <div className="alert good">
          <span>
            {state.ok}{" "}
            {state.link ? <>Invite link: <a href={state.link}><b>{state.link}</b></a></> : null}
          </span>
        </div>
      ) : null}
      <button className="btn primary" disabled={pending}>{pending ? "Sending…" : "Send Invite to Vendor"}</button>
    </form>
  );
}
