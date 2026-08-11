"use client";

import { useState } from "react";
import Link from "next/link";

export default function FlipStatCard({ label, value, vendors }: { label: string; value: number; vendors: { id: string; name: string }[] }) {
  const [flipped, setFlipped] = useState(false);

  return (
    <div className="flip-card" onClick={() => setFlipped((f) => !f)}>
      <div className={`flip-card-inner ${flipped ? "is-flipped" : ""}`}>
        <div className="flip-card-face flip-card-front stat">
          <div className="label">{label}</div>
          <div className="value">{value}</div>
          <div className="delta">Click to see the list</div>
        </div>
        <div className="flip-card-face flip-card-back stat">
          <div className="flip-card-back-head">
            <span className="label">{label}</span>
            <button
              className="btn sm ghost"
              onClick={(e) => { e.stopPropagation(); setFlipped(false); }}
              aria-label="Flip back"
            >
              ×
            </button>
          </div>
          <div className="flip-card-list">
            {vendors.length === 0 ? (
              <span className="sub">No vendors yet.</span>
            ) : (
              vendors.map((v) => (
                <Link key={v.id} href={`/admin/vendors/${v.id}`} onClick={(e) => e.stopPropagation()}>
                  {v.name}
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
