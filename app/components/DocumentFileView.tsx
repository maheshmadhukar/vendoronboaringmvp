"use client";

// Renders a real uploaded document from a (server-issued) signed URL. PDFs embed
// inline; images render directly; anything else falls back to an open link.
// When url is null the record has no stored file (legacy/mock or not yet
// uploaded) and an empty state is shown.
const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg"]);

export default function DocumentFileView({
  url,
  filename,
}: {
  url: string | null;
  filename: string | null;
}) {
  if (!url) {
    return (
      <div className="simple-doc-layout">
        <div>
          <div className="doc-preview" />
          <p className="doc-preview-name">{filename ?? "No file uploaded yet"}</p>
        </div>
        <div>
          <p className="muted" style={{ fontSize: 13 }}>
            No file is stored for this document. It was created before file storage was enabled, or
            hasn&apos;t been uploaded yet.
          </p>
        </div>
      </div>
    );
  }

  const ext = filename?.split(".").pop()?.toLowerCase() ?? "";
  if (IMAGE_EXT.has(ext)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={filename ?? "document"} style={{ maxWidth: "100%", borderRadius: 8 }} />;
  }

  return (
    <object data={url} type="application/pdf" style={{ width: "100%", height: "70vh", border: "1px solid var(--border)", borderRadius: 8 }}>
      <p className="muted" style={{ fontSize: 13 }}>
        Preview unavailable in this browser.{" "}
        <a href={url} target="_blank" rel="noreferrer">Open the file</a>.
      </p>
    </object>
  );
}
