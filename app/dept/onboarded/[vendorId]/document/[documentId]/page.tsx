import Link from "next/link";
import { redirect } from "next/navigation";
import Shell from "@/app/components/Shell";
import MockDocumentContent from "@/app/components/MockDocumentContent";
import DownloadDocumentButton from "@/app/components/DownloadDocumentButton";
import DocumentFileView from "@/app/components/DocumentFileView";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getDocumentContent, isRichDocType, buildDocumentText } from "@/lib/documentContent";
import { isStoredObject, signedUrl } from "@/lib/storage";
import { VSTATUS } from "@/lib/constants";

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
  const fileUrl = !rich && isStoredObject(document.storedPath) ? await signedUrl(document.storedPath) : null;
  const downloadUrl = !rich && isStoredObject(document.storedPath)
    ? await signedUrl(document.storedPath, { download: document.filename ?? undefined })
    : null;

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
        {rich ? (
          <DownloadDocumentButton filename={filename} text={text} />
        ) : downloadUrl ? (
          <a className="btn sm primary" href={downloadUrl}>Download</a>
        ) : null}
      </div>

      {rich ? (
        <MockDocumentContent content={content} rich={rich} />
      ) : (
        <DocumentFileView url={fileUrl} filename={document.filename} />
      )}
    </Shell>
  );
}
