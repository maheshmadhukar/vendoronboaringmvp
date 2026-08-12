// Hand-rolled funnel (server component). Recharts' <Funnel> clipped its labels
// and collapsed under chart margins on React 19 / Next 16; these centered
// progressive-width bars render reliably with every stage's text always visible.

export type FunnelRow = { label: string; count: number; pctOfTop: number; dropoffPct: number | null };

export default function FunnelBars({ stages }: { stages: FunnelRow[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {stages.map((s, i) => (
        <div key={s.label} style={{ display: "grid", gridTemplateColumns: "128px 1fr 96px", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12.5, color: "var(--ink-soft)", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {s.label}
          </span>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <div
              style={{
                width: `${Math.max(6, s.pctOfTop)}%`,
                height: 30,
                background: "var(--accent)",
                opacity: 1 - i * 0.11,
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "width .3s ease",
              }}
            >
              {s.pctOfTop >= 16 ? (
                <span style={{ fontSize: 11.5, fontWeight: 700, color: "#fff", whiteSpace: "nowrap" }}>{s.pctOfTop}%</span>
              ) : null}
            </div>
          </div>
          <span style={{ fontSize: 12.5, textAlign: "left", whiteSpace: "nowrap" }}>
            <span className="tnum" style={{ fontWeight: 700, color: "var(--ink)" }}>{s.count}</span>
            {s.dropoffPct != null && s.dropoffPct > 0 ? (
              <span className="tnum" style={{ color: "var(--warn)", fontSize: 11, marginLeft: 6 }}>▼{s.dropoffPct}%</span>
            ) : null}
          </span>
        </div>
      ))}
    </div>
  );
}
