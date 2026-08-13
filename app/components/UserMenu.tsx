"use client";

import { useState, useEffect, useRef } from "react";
import { logoutAction } from "@/app/actions/auth";

/**
 * Topbar user tab: shows name + role, with the (often long) email tucked into a
 * dropdown alongside Sign out. Replaces the old sidebar-footer user block and the
 * redundant top-right notification indicator.
 */
export default function UserMenu({
  name,
  roleLabel,
  email,
}: {
  name: string;
  roleLabel: string;
  email: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        className="user-tab"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="user-tab-info">
          <b>{name}</b>
          <span>{roleLabel}</span>
        </span>
        <span className="user-tab-caret" aria-hidden>⌄</span>
      </button>
      {open ? (
        <div
          role="menu"
          style={{
            position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 20,
            background: "var(--panel)", border: "1px solid var(--border)",
            borderRadius: 8, boxShadow: "var(--shadow-md)", minWidth: 220, padding: 10,
          }}
        >
          <div style={{ fontSize: 11, color: "var(--ink-faint)", marginBottom: 2 }}>Signed in as</div>
          <div style={{ fontSize: 12.5, color: "var(--ink)", wordBreak: "break-all", marginBottom: 10 }}>{email}</div>
          <form action={logoutAction}>
            <button className="btn sm ghost" style={{ width: "100%", justifyContent: "flex-start" }}>
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
