"use client";

import { useState } from "react";
import Link from "next/link";
import { fmtDate } from "@/lib/format";

type Doc = {
  id: string;
  filename: string | null;
  sizeKb: number | null;
  uploadedAt: Date | null;
  documentType: { name: string };
};

export default function DeptDocumentsModal({
  deptLabel,
  vendorId,
  documents,
}: {
  deptLabel: string;
  vendorId: string;
  documents: Doc[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="btn sm ghost"
        aria-label={`View ${deptLabel} documents`}
        onClick={() => setOpen(true)}
      >
        ▤
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
              <div className="section-label" style={{ margin: 0 }}>{deptLabel} documents</div>
              <button type="button" className="btn sm ghost" onClick={() => setOpen(false)} aria-label="Close">✕</button>
            </div>
            {documents.length === 0 ? (
              <p className="muted" style={{ fontSize: 13 }}>No documents submitted to this department yet.</p>
            ) : (
              documents.map((d) => (
                <Link key={d.id} href={`/admin/vendors/${vendorId}/document/${d.id}`} className="doc-row" style={{ textDecoration: "none" }}>
                  <div className="doc-ico" />
                  <div className="doc-info">
                    <div className="doc-name">{d.documentType.name}</div>
                    <div className="doc-meta">
                      {d.filename ?? "not uploaded"}{d.sizeKb ? ` · ${d.sizeKb} KB` : ""} · {fmtDate(d.uploadedAt)}
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
