export default function SectionHeader({
  title,
  help,
}: {
  title: string;
  help?: string;
}) {
  return (
    <div className="sec-head">
      <div className="sec-title-row">
        <h2>{title}</h2>
      </div>
      {help ? <p>{help}</p> : null}
    </div>
  );
}
