"use client";

import { useState } from "react";
import { switchPersonaAction, returnToAdminAction } from "@/app/actions/auth";

export default function PersonaSwitcherMenu({
  personas,
  currentEmail,
  showReturnToAdmin,
}: {
  personas: readonly { label: string; email: string }[];
  currentEmail: string;
  showReturnToAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: "relative" }}>
      <button type="button" className="btn sm ghost" onClick={() => setOpen((o) => !o)}>
        ⚙ Switch persona
      </button>
      {open ? (
        <div
          style={{
            position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 20,
            background: "var(--surface, #fff)", border: "1px solid var(--border)",
            borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.12)", minWidth: 200, padding: 6,
          }}
          onClick={() => setOpen(false)}
        >
          {showReturnToAdmin ? (
            <form action={returnToAdminAction}>
              <button className="btn sm" style={{ width: "100%", justifyContent: "flex-start", marginBottom: 4 }}>
                ↩ Return to Admin
              </button>
            </form>
          ) : null}
          {personas
            .filter((p) => p.email !== currentEmail)
            .map((p) => (
              <form action={switchPersonaAction} key={p.email}>
                <input type="hidden" name="email" value={p.email} />
                <button className="btn sm ghost" style={{ width: "100%", justifyContent: "flex-start" }}>
                  {p.label}
                </button>
              </form>
            ))}
        </div>
      ) : null}
    </div>
  );
}
