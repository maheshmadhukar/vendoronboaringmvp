"use client";

import { useEffect, useState } from "react";
import { consumeLoginFlash } from "@/app/actions/auth";

export default function SlaBreachPopup({ justLoggedIn, vendorNames }: { justLoggedIn: boolean; vendorNames: string[] }) {
  const [open, setOpen] = useState(justLoggedIn && vendorNames.length > 0);

  useEffect(() => {
    if (justLoggedIn) consumeLoginFlash();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={() => setOpen(false)}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <div className="card card-pad" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, gap: 12 }}>
          <div className="card-title" style={{ color: "var(--bad)" }}>
            {vendorNames.length} SLA breach{vendorNames.length === 1 ? "" : "es"}
          </div>
          <button className="btn sm ghost" onClick={() => setOpen(false)}>✕</button>
        </div>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {vendorNames.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
