"use client";

import { useActionState } from "react";
import { inviteVendor } from "@/app/actions/admin";

export default function InviteVendorForm() {
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
      {state?.error ? <div className="alert bad">{state.error}</div> : null}
      {state?.ok ? (
        <div className="alert good">
          <span>
            {state.ok}{" "}
            {state.link ? <>Invite link: <a href={state.link}><b>{state.link}</b></a></> : null}
          </span>
        </div>
      ) : null}
      <button className="btn primary" disabled={pending}>{pending ? "Creating…" : "Create invite"}</button>
      <span className="btn-note" style={{ marginLeft: 10 }}>Duplicate vendors are blocked. Vendors cannot self-register.</span>
    </form>
  );
}
