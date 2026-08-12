import Link from "next/link";
import { redirect } from "next/navigation";
import Shell from "@/app/components/Shell";
import MockDocumentContent from "@/app/components/MockDocumentContent";
import DownloadDocumentButton from "@/app/components/DownloadDocumentButton";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getDocumentContent, isRichDocType, buildDocumentText } from "@/lib/documentContent";

export default async function AdminVendorDocumentPage({
  params,
}: {
  params: Promise<{ id: string; documentId: string }>;
}) {
  await requireAdmin();
  const { id: vendorId, documentId } = await params;

  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: { documentType: true, vendor: true },
  });
  if (!document || document.vendorId !== vendorId) redirect(`/admin/vendors/${vendorId}`);

  const content = getDocumentContent(document.documentType.key, document.vendor);
  const rich = isRichDocType(document.documentType.key);
  const filename = document.filename ?? (content.kind === "simple" ? content.previewLabel : `${document.documentType.name}.txt`);
  const text = buildDocumentText(
    { documentTypeName: document.documentType.name, vendorName: document.vendor.name, filename: document.filename },
    content,
  );

  return (
    <Shell
      active="dashboard"
      title={`${document.documentType.name} — Document`}
      crumbs={
        <>
          <Link href="/admin">Status Dashboard</Link><span className="crumb-sep">/</span>
          <Link href={`/admin/vendors/${vendorId}`}>{document.vendor.name}</Link><span className="crumb-sep">/</span>
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

      <MockDocumentContent content={content} rich={rich} />
    </Shell>
  );
}
