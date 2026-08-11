import Shell from "@/app/components/Shell";
import { Alert } from "@/app/components/ui";
import { requireVendor } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getVendorDocTypes } from "@/lib/vendor";
import { DEPT_LABEL, DEPT_ORDER, VSTATUS, DOC_STATUS } from "@/lib/constants";
import DocUploadRow from "./DocUploadRow";
import SubmitButton from "./SubmitButton";

export default async function DocumentsPage() {
  const user = await requireVendor();
  const vendor = await prisma.vendor.findUnique({ where: { id: user.vendorId! } });
  if (!vendor) return null;

  const types = await getVendorDocTypes(vendor.id);
  const docs = await prisma.document.findMany({ where: { vendorId: vendor.id } });
  const byType = new Map(docs.map((d) => [d.documentTypeId, d]));

  const editable =
    vendor.status === VSTATUS.DRAFT ||
    vendor.status === VSTATUS.INVITED ||
    vendor.status === VSTATUS.CHANGES_REQUESTED;
  const preSubmit = vendor.status === VSTATUS.DRAFT || vendor.status === VSTATUS.INVITED;

  const mandatory = types.filter((t) => t.mandatory);
  const uploadedCount = mandatory.filter((t) => {
    const d = byType.get(t.id);
    return d && d.status !== DOC_STATUS.PENDING;
  }).length;
  const canSubmit = uploadedCount === mandatory.length;

  // group by dept
  const groups = DEPT_ORDER.map((k) => ({ key: k, items: types.filter((t) => t.departmentKey === k) }))
    .filter((g) => g.items.length > 0);

  return (
    <Shell active="docs" title="Documents">
      <div className="page-head">
        <div>
          <h1>Documents</h1>
          <p>Upload all required documents — the application is submitted in one go, not in parts.</p>
        </div>
        <span className="chip neutral">{uploadedCount}/{mandatory.length} uploaded</span>
      </div>

      {!preSubmit ? (
        <Alert tone="info"><span>Your application has been submitted. You can only re-upload documents a department has asked you to change.</span></Alert>
      ) : null}

      {groups.map((g) => (
        <div className="card card-pad" key={g.key} style={{ marginBottom: 18 }}>
          <div className="section-label">{DEPT_LABEL[g.key]} documents</div>
          {g.items.map((t) => {
            const cur = byType.get(t.id) ?? null;
            const rowEditable =
              editable &&
              (preSubmit || cur?.status === DOC_STATUS.CHANGES_REQUESTED || cur?.status === DOC_STATUS.PENDING || !cur);
            return (
              <DocUploadRow
                key={t.id}
                doc={{ id: t.id, name: t.name, accepted: t.acceptedFormats, maxMb: t.maxSizeMb, helper: t.helperText, dept: DEPT_LABEL[g.key] }}
                current={cur ? { filename: cur.filename, status: cur.status, reviewNote: cur.reviewNote } : null}
                editable={rowEditable}
              />
            );
          })}
        </div>
      ))}

      {preSubmit ? (
        <div className="card card-pad">
          <div className="card-title">Submit application</div>
          <div className="card-sub">All mandatory documents must be uploaded first.</div>
          <SubmitButton canSubmit={canSubmit} />
        </div>
      ) : null}
    </Shell>
  );
}
