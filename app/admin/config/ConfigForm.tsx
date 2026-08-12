"use client";

import { useActionState } from "react";
import { updateConfig } from "@/app/actions/admin";
import { DEPT_LABEL } from "@/lib/constants";

type Cfg = {
  slaDaysDefault: number; cutoffHour: number; finalApprovalRequired: boolean;
  aiReviewDefault: boolean; notifyVendorOnStatus: boolean; notifyDeptOnSla: boolean; notifyDeptOnResubmit: boolean;
};
type Dept = { id: string; key: string; name: string; slaDays: number };

function Toggle({ name, label, defaultChecked }: { name: string; label: string; defaultChecked: boolean }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 10, color: "var(--ink)" }}>
      <input type="checkbox" name={name} defaultChecked={defaultChecked} /> {label}
    </label>
  );
}

export default function ConfigForm({ cfg, depts }: { cfg: Cfg; depts: Dept[] }) {
  const [state, action, pending] = useActionState(updateConfig, null as { ok?: string } | null);
  return (
    <>
      <form action={action}>
        <div className="form-grid">
          <div className="field">
            <label>Default SLA (working days)</label>
            <input name="slaDaysDefault" type="number" defaultValue={cfg.slaDaysDefault} min={1} />
          </div>
          <div className="field">
            <label>Cutoff hour (24h) — docs after this count next working day</label>
            <input name="cutoffHour" type="number" defaultValue={cfg.cutoffHour} min={0} max={23} />
            <span className="hint">Friday submissions after cutoff start the clock Monday.</span>
          </div>
        </div>

        <div className="section-label" style={{ marginTop: 8 }}>Per-department SLA (working days)</div>
        <div className="form-grid">
          {depts.map((d) => (
            <div className="field" key={d.id}>
              <label>{DEPT_LABEL[d.key] ?? d.name}</label>
              <input name={`sla_${d.id}`} type="number" defaultValue={d.slaDays} min={1} />
            </div>
          ))}
        </div>

        <div className="section-label" style={{ marginTop: 8 }}>Gates &amp; automation</div>
        <Toggle name="finalApprovalRequired" label="Require Admin final approval after all departments approve" defaultChecked={cfg.finalApprovalRequired} />
        <Toggle name="aiReviewDefault" label="Enable AI auto-review column (mocked in this prototype)" defaultChecked={cfg.aiReviewDefault} />

        <div className="section-label" style={{ marginTop: 8 }}>Notification triggers</div>
        <Toggle name="notifyVendorOnStatus" label="Notify vendor on status changes (in-app + email)" defaultChecked={cfg.notifyVendorOnStatus} />
        <Toggle name="notifyDeptOnSla" label="Notify dept head as SLA nears / breaches" defaultChecked={cfg.notifyDeptOnSla} />
        <Toggle name="notifyDeptOnResubmit" label="Notify dept head on vendor resubmission / clarification" defaultChecked={cfg.notifyDeptOnResubmit} />

        {state?.ok ? <div className="alert good" style={{ marginTop: 14 }}>{state.ok}</div> : null}
        <button className="btn primary" disabled={pending} style={{ marginTop: 8 }}>{pending ? "Saving…" : "Save configuration"}</button>
      </form>
    </>
  );
}
