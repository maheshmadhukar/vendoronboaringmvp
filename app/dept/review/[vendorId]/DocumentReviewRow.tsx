import Link from "next/link";
import { Chip } from "@/app/components/ui";

const docTone: Record<string, string> = {
  PENDING: "neutral", SUBMITTED: "info", APPROVED: "good", REJECTED: "bad", CHANGES_REQUESTED: "warn",
};

type Doc = {
  id: string;
  vendorId: string;
  status: string;
  filename: string | null;
  sizeKb: number | null;
  reviewNote: string | null;
  documentType: { name: string };
};

export default function DocumentReviewRow({ document }: { document: Doc }) {
  return (
    <div className="doc-row">
      <div className="doc-ico" />
      <div className="doc-info">
        <div className="doc-name">{document.documentType.name}</div>
        <div className="doc-meta">{document.filename ?? "not uploaded"}{document.sizeKb ? ` · ${document.sizeKb} KB` : ""}</div>
        {document.reviewNote ? <div className="doc-flag">{document.reviewNote}</div> : null}
      </div>
      <div className="doc-actions">
        <Chip tone={docTone[document.status] ?? "neutral"}>{document.status.replace(/_/g, " ").toLowerCase()}</Chip>
        <Link className="btn sm ghost" href={`/dept/review/${document.vendorId}/document/${document.id}`}>View</Link>
      </div>
    </div>
  );
}
