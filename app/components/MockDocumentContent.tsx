import type { DocContent } from "@/lib/documentContent";

export default function MockDocumentContent({ content, rich }: { content: DocContent; rich: boolean }) {
  if (rich && content.kind === "rich") {
    return (
      <div className="doc-paper">
        {content.sections.map((s, i) => (
          <div key={i}>
            <h6>{s.heading}</h6>
            <p>{s.body}</p>
          </div>
        ))}
      </div>
    );
  }

  if (content.kind === "simple") {
    return (
      <div className="simple-doc-layout">
        <div>
          <div className="doc-preview" />
          <p className="doc-preview-name">{content.previewLabel}</p>
        </div>
        <div>
          <dl className="field-list">
            {content.fields.map((f, i) => (
              <div key={i}>
                <dt>{f.label}</dt>
                <dd style={f.tone === "warn" ? { color: "var(--warn)" } : f.tone === "bad" ? { color: "var(--bad)" } : undefined}>{f.value}</dd>
              </div>
            ))}
            <div>
              <dt>Verification</dt>
              <dd><span className={`chip ${content.verification.tone}`}>{content.verification.tone === "good" ? "Verified" : "Flagged"}</span> — {content.verification.text}</dd>
            </div>
          </dl>
        </div>
      </div>
    );
  }

  return null;
}
