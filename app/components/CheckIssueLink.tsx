"use client";

import { useState } from "react";
import { fmtDateTime } from "@/lib/format";

type IssueComment = { id: string; author: { name: string }; kind: string; createdAt: Date; body: string };

export default function CheckIssueLink({ docName, comments }: { docName: string; comments: IssueComment[] }) {
  const [open, setOpen] = useState(false);
  if (comments.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit", color: "var(--accent)", textDecoration: "underline" }}
      >
        Check Issue
      </button>
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={() => setOpen(false)}
        >
          <div
            className="card card-pad"
            style={{ maxWidth: 480, width: "100%", maxHeight: "80vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
              <div className="section-label" style={{ margin: 0 }}>{docName}</div>
              <button type="button" className="btn sm ghost" onClick={() => setOpen(false)} aria-label="Close">✕</button>
            </div>
            {comments.map((c) => (
              <div className="comment" key={c.id}>
                <div className="who2">{c.author.name} <span className="role">· {c.kind.toLowerCase()}</span></div>
                <div className="when">{fmtDateTime(c.createdAt)}</div>
                <div className="body">{c.body}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}
