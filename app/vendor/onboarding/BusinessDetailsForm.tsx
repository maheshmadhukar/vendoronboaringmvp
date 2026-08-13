"use client";

import { useActionState } from "react";
import { saveBusinessDetails } from "@/app/actions/vendor";

type V = {
  name?: string | null; address?: string | null; phone?: string | null;
  bankAccount?: string | null; contactPerson?: string | null; gstin?: string | null;
  turnover?: number | null; companyEmail?: string | null;
};

export default function BusinessDetailsForm({ vendor, editable }: { vendor: V; editable: boolean }) {
  const [state, action, pending] = useActionState(saveBusinessDetails, null as { error?: string; ok?: string } | null);
  const dis = !editable;
  return (
    <form action={action}>
      <div className="form-grid">
        <div className="field full">
          <label>Vendor name</label>
          <input name="name" defaultValue={vendor.name ?? ""} disabled={dis} />
        </div>
        <div className="field full">
          <label>Registered address <span className="req">*</span></label>
          <input name="address" defaultValue={vendor.address ?? ""} disabled={dis} placeholder="Street, city, state, PIN" />
        </div>
        <div className="field">
          <label>Phone number <span className="req">*</span></label>
          <input
            name="phone"
            type="tel"
            inputMode="numeric"
            pattern="[6-9][0-9]{9}"
            maxLength={10}
            title="10-digit mobile number starting with 6-9"
            defaultValue={vendor.phone ?? ""}
            disabled={dis}
          />
        </div>
        <div className="field">
          <label>Bank account details <span className="req">*</span></label>
          <input name="bankAccount" defaultValue={vendor.bankAccount ?? ""} disabled={dis} placeholder="Bank, account no., IFSC" />
        </div>
        <div className="field">
          <label>Contact person</label>
          <input name="contactPerson" defaultValue={vendor.contactPerson ?? ""} disabled={dis} />
        </div>
        <div className="field">
          <label>GSTIN</label>
          <input
            name="gstin"
            pattern="[0-9]{2}[A-Za-z0-9]{10}[0-9A-Za-z]{3}"
            maxLength={15}
            title="15-character GSTIN, e.g. 27ABCDE1234F1Z5"
            defaultValue={vendor.gstin ?? ""}
            disabled={dis}
            placeholder="27ABCDE1234F1Z5"
          />
          <span className="hint">Validated for format; duplicates are blocked.</span>
        </div>
        <div className="field">
          <label>Annual turnover (₹)</label>
          <input name="turnover" type="number" defaultValue={vendor.turnover ?? ""} disabled={dis} />
        </div>
        <div className="field">
          <label>Company email</label>
          <input name="companyEmail" type="email" defaultValue={vendor.companyEmail ?? ""} disabled={dis} />
        </div>
      </div>

      {state?.error ? <div className="alert bad">{state.error}</div> : null}
      {state?.ok ? <div className="alert good">{state.ok}</div> : null}

      <div className="btn-row">
        <button className="btn primary" disabled={pending || dis}>
          {pending ? "Submitting…" : "Submit Business Details"}
        </button>
        <span className="btn-note">
          {editable ? "Mandatory: address, phone, bank account." : "Locked while under review."}
        </span>
      </div>
    </form>
  );
}
