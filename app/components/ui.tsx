import { PIPELINE_STAGES } from "@/lib/constants";

export function Chip({ tone = "neutral", children }: { tone?: string; children: React.ReactNode }) {
  return <span className={`chip ${tone}`}>{children}</span>;
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="empty">
      <div className="ico" />
      <h3>{title}</h3>
      {hint ? <p>{hint}</p> : null}
    </div>
  );
}

export function Alert({ tone = "info", children }: { tone?: string; children: React.ReactNode }) {
  return <div className={`alert ${tone}`}>{children}</div>;
}

/** End-to-end pipeline status bar (visible to all assigned dept users). */
export function Tracker({ stage, breached }: { stage: number; breached?: boolean }) {
  return (
    <div className="tracker">
      {PIPELINE_STAGES.map((label, i) => {
        let cls = "step";
        if (i < stage) cls += " done";
        else if (i === stage) cls += breached ? " bad" : " current";
        return (
          <div key={label} className={cls}>
            <span className="bar" />
            <span className="dot" />
            <span className="lbl">{label}</span>
          </div>
        );
      })}
    </div>
  );
}
