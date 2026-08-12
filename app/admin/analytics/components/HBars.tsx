// Hand-rolled horizontal bar chart (server component). Recharts' vertical-layout
// bars proved unreliable under React 19 / Next 16; these CSS bars render
// deterministically and theme perfectly via the app's design tokens.

export type HBar = { label: string; value: number | null; color?: string; valueLabel?: string };

export default function HBars({
  rows,
  unit = "",
  marker,
  labelWidth = 92,
}: {
  rows: HBar[];
  unit?: string;
  marker?: { value: number; label: string };
  labelWidth?: number;
}) {
  const values = rows.map((r) => r.value ?? 0);
  const max = Math.max(marker?.value ?? 0, ...values, 1) * 1.12;
  const fmt = (v: number | null, vl?: string) => (vl != null ? vl : v == null ? "—" : `${Number.isInteger(v) ? v : v.toFixed(1)}${unit}`);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: marker ? 14 : 2 }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: `${labelWidth}px 1fr 52px`, alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, color: "var(--ink-soft)", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</span>
          <div style={{ position: "relative", height: 22, background: "var(--neutral-bg)", borderRadius: 6, overflow: "visible" }}>
            <div style={{ position: "absolute", inset: 0, borderRadius: 6, overflow: "hidden" }}>
              <div style={{ width: `${Math.min(100, ((r.value ?? 0) / max) * 100)}%`, height: "100%", background: r.color ?? "var(--accent)", borderRadius: 6, transition: "width .3s ease" }} />
            </div>
            {marker && i === 0 ? (
              <div style={{ position: "absolute", left: `${Math.min(100, (marker.value / max) * 100)}%`, top: -14, bottom: 0, borderLeft: "2px dashed var(--bad)", paddingLeft: 4 }}>
                <span style={{ position: "absolute", top: -14, left: 4, fontSize: 10, color: "var(--bad)", whiteSpace: "nowrap" }}>{marker.label}</span>
              </div>
            ) : marker ? (
              <div style={{ position: "absolute", left: `${Math.min(100, (marker.value / max) * 100)}%`, top: 0, bottom: 0, borderLeft: "2px dashed var(--bad)" }} />
            ) : null}
          </div>
          <span className="tnum" style={{ fontSize: 12, fontWeight: 650, color: "var(--ink)", textAlign: "right" }}>{fmt(r.value, r.valueLabel)}</span>
        </div>
      ))}
    </div>
  );
}
