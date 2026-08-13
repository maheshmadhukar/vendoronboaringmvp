"use client";

import { useState, useTransition } from "react";
import { updateDocType, setDocumentTypeActive } from "@/app/actions/admin";

type DocType = { id: string; name: string; acceptedFormats: string; maxSizeMb: number; active: boolean };

/**
 * One document-requirement row. The format select and max-size input are
 * CONTROLLED and auto-save the moment they change — no separate Save button to
 * miss. Previously these were uncontrolled inputs wired to a `display:contents`
 * form in another table cell via the `form=` attribute; changing the dropdown
 * without finding+clicking that Save button silently discarded the change.
 */
export default function DocTypeRow({
  t,
  deptLabel,
  formats,
}: {
  t: DocType;
  deptLabel: string;
  formats: readonly string[];
}) {
  const initialFormat = formats.includes(t.acceptedFormats) ? t.acceptedFormats : "doc";
  const [format, setFormat] = useState(initialFormat);
  const [maxMb, setMaxMb] = useState(String(t.maxSizeMb));
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [pending, start] = useTransition();

  const save = (next: { format?: string; maxMb?: string }) => {
    const acceptedFormats = next.format ?? format;
    const maxSizeMb = Number(next.maxMb ?? maxMb);
    start(async () => {
      try {
        await updateDocType({ id: t.id, acceptedFormats, maxSizeMb });
        setStatus("saved");
      } catch {
        setStatus("error");
      }
    });
  };

  return (
    <tr style={t.active ? undefined : { opacity: 0.55 }}>
      <td className="strong">{t.name}</td>
      <td>{deptLabel}</td>
      <td>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <select
            name="acceptedFormats"
            value={format}
            disabled={pending}
            onChange={(e) => { setFormat(e.target.value); setStatus("idle"); save({ format: e.target.value }); }}
            style={{ fontSize: 12, padding: "4px 8px" }}
          >
            {formats.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          {pending ? <span className="sub" style={{ fontSize: 11 }}>Saving…</span>
            : status === "saved" ? <span className="sub" style={{ fontSize: 11, color: "var(--good)" }}>Saved ✓</span>
            : status === "error" ? <span className="sub" style={{ fontSize: 11, color: "var(--bad)" }}>Failed — retry</span>
            : null}
        </div>
      </td>
      <td>
        <input
          type="number"
          value={maxMb}
          disabled={pending}
          onChange={(e) => { setMaxMb(e.target.value); setStatus("idle"); }}
          onBlur={(e) => { if (e.target.value !== String(t.maxSizeMb)) save({ maxMb: e.target.value }); }}
          style={{ width: 64, fontSize: 12, padding: "4px 8px" }}
        />
      </td>
      <td>{t.active ? <span className="chip good">Active</span> : <span className="chip neutral">Inactive</span>}</td>
      <td>
        <form action={setDocumentTypeActive}>
          <input type="hidden" name="id" value={t.id} />
          <input type="hidden" name="active" value={t.active ? "false" : "true"} />
          <button className={`btn sm ${t.active ? "danger" : ""}`}>{t.active ? "Remove" : "Restore"}</button>
        </form>
      </td>
    </tr>
  );
}
