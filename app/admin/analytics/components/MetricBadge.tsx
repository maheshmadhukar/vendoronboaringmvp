export type BadgeKind = "lead" | "lag" | "biz" | "user";

const LABEL: Record<BadgeKind, string> = {
  lead: "Leading",
  lag: "Lagging",
  biz: "Business",
  user: "User",
};

export default function MetricBadge({ kind }: { kind: BadgeKind }) {
  return <span className={`badge ${kind}`}>{LABEL[kind]}</span>;
}
