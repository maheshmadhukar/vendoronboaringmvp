"use client";

import { useState } from "react";

/** Cosmetic mock of a Workday employee lookup — no real integration, nothing persisted. */
export default function WorkdayFetchBox() {
  const [email, setEmail] = useState("");
  const [fetched, setFetched] = useState(false);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
      <input
        type="email"
        placeholder="employee@company.com"
        value={email}
        onChange={(e) => { setEmail(e.target.value); setFetched(false); }}
        style={{ fontSize: 11.5, padding: "3px 6px", width: 140, border: "1px solid var(--border-strong)", borderRadius: "var(--radius-sm)", background: "var(--panel)", color: "var(--ink)" }}
      />
      <button
        type="button"
        className="btn sm ghost"
        style={{ fontSize: 11, padding: "3px 8px" }}
        onClick={() => setFetched(true)}
        disabled={!email}
      >
        Fetch from Workday
      </button>
      {fetched ? <span className="sub" style={{ color: "var(--good)", fontSize: 11 }}>✓ Fetched (demo)</span> : null}
    </div>
  );
}
