import MetricBadge, { type BadgeKind } from "./MetricBadge";

export default function SectionHeader({
  title,
  help,
  tags = [],
}: {
  title: string;
  help?: string;
  tags?: BadgeKind[];
}) {
  return (
    <div className="sec-head">
      <div className="sec-title-row">
        <h2>{title}</h2>
        {tags.map((t) => <MetricBadge key={t} kind={t} />)}
      </div>
      {help ? <p>{help}</p> : null}
    </div>
  );
}
