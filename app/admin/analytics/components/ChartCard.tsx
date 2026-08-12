export default function ChartCard({
  title,
  sub,
  right,
  children,
}: {
  title: string;
  sub?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="card card-pad" style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
        <div>
          <div className="section-label" style={{ margin: 0 }}>{title}</div>
          {sub ? <div className="sub" style={{ fontSize: 11.5, marginTop: 4 }}>{sub}</div> : null}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}
