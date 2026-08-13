export default function KpiCard({
  label,
  value,
  deltaPct,
  deltaSuffix = "%",
  higherIsBetter = true,
  sub,
}: {
  label: string;
  value: string;
  deltaPct?: number | null;
  deltaSuffix?: string;
  higherIsBetter?: boolean;
  sub?: string;
}) {
  let deltaEl: React.ReactNode = null;
  if (deltaPct != null) {
    const up = deltaPct > 0;
    const flat = deltaPct === 0;
    const good = flat ? false : up === higherIsBetter;
    const cls = flat ? "flat" : good ? "good" : "bad";
    const arrow = flat ? "→" : up ? "▲" : "▼";
    deltaEl = (
      <span className={`kpi-delta ${cls}`}>
        {arrow} {Math.abs(deltaPct)}{deltaSuffix} <span style={{ color: "var(--ink-faint)", fontWeight: 500 }}>vs prev</span>
      </span>
    );
  }

  return (
    <div className="kpi">
      <div className="kpi-top">
        <span className="kpi-label">{label}</span>
      </div>
      <div className="kpi-value">{value}</div>
      {deltaEl ?? <span className="kpi-delta flat">—</span>}
      {sub ? <span className="kpi-sub">{sub}</span> : null}
    </div>
  );
}
