import Link from "next/link";
import { redirect } from "next/navigation";
import Shell from "@/app/components/Shell";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getDocumentContent, isRichDocType, buildDocumentText } from "@/lib/documentContent";
import { VSTATUS } from "@/lib/constants";
import DownloadDocumentButton from "./DownloadDocumentButton";

export default async function OnboardedDocumentPage({
  params,
}: {
  params: Promise<{ vendorId: string; documentId: string }>;
}) {
  await requireAdmin();
  const { vendorId, documentId } = await params;

  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: { documentType: true, vendor: true },
  });
  if (!document || document.vendorId !== vendorId || document.vendor.status !== VSTATUS.ONBOARDED) {
    redirect("/dept");
  }

  const content = getDocumentContent(document.documentType.key, document.vendor);
  const rich = isRichDocType(document.documentType.key);
  const filename = document.filename ?? (content.kind === "simple" ? content.previewLabel : `${document.documentType.name}.txt`);
  const text = buildDocumentText(
    { documentTypeName: document.documentType.name, vendorName: document.vendor.name, filename: document.filename },
    content,
  );

  return (
    <Shell
      active="procurement"
      title={`${document.documentType.name} — Document`}
      crumbs={
        <>
          <Link href="/dept">Procurement Review</Link><span className="crumb-sep">/</span>
          <Link href={`/dept/onboarded/${vendorId}`}>{document.vendor.name}</Link><span className="crumb-sep">/</span>
          {document.documentType.name}
        </>
      }
    >
      <div className="page-head">
        <div>
          <h1>{document.documentType.name}</h1>
          <p>{document.vendor.name} · {document.filename ?? "not uploaded"}</p>
        </div>
        <DownloadDocumentButton filename={filename} text={text} />
      </div>

      {rich && content.kind === "rich" ? (
        <div className="doc-paper">
          {content.sections.map((s, i) => (
            <div key={i}>
              <h6>{s.heading}</h6>
              <p>{s.body}</p>
            </div>
          ))}
        </div>
      ) : content.kind === "simple" ? (
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
      ) : null}
    </Shell>
  );
}
