import Shell from "@/app/components/Shell";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/workflow";
import { DEPT, DEPT_LABEL } from "@/lib/constants";
import { setBuyerDocTemplateActive } from "@/app/actions/admin";
import { paginate } from "@/lib/paginate";
import Pagination from "@/app/components/Pagination";
import ConfigForm from "./ConfigForm";
import DocTypeRow from "./DocTypeRow";
import AddDocumentTypeForm from "./AddDocumentTypeForm";
import BuyerDocTemplateFileCell from "./BuyerDocTemplateFileCell";

const DOC_FORMATS = ["doc", "pdf", "jpeg"] as const;

type SearchParams = { docTypesPage?: string; templatesPage?: string };

export default async function ConfigPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin();
  const sp = await searchParams;
  const cfg = await getConfig();
  const depts = await prisma.department.findMany({ orderBy: { name: "asc" } });
  const docTypes = await prisma.documentType.findMany({ orderBy: { order: "asc" } });
  const buyerDocTemplates = await prisma.buyerDocTemplate.findMany({ orderBy: { order: "asc" } });
  const reviewDepts = depts.filter((d) => d.key !== DEPT.PROCUREMENT);
  const visibleDocTypes = docTypes.filter((t) => t.departmentKey !== DEPT.PROCUREMENT);
  const docTypesPagination = paginate(visibleDocTypes, Number(sp.docTypesPage) || 1);
  const templatesPagination = paginate(buyerDocTemplates, Number(sp.templatesPage) || 1);

  return (
    <Shell active="config" title="Configuration">
      <div className="page-head">
        <div><h1>Configuration</h1><p>SLA rules, cutoff logic, approval gates, notifications, and document requirements.</p></div>
      </div>

      <div className="card card-pad">
        <div className="card-title">SLA, gates &amp; notifications</div>
        <ConfigForm cfg={cfg} depts={reviewDepts} />
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <div className="card-pad" style={{ paddingBottom: 0 }}>
          <div className="card-title">Document requirements</div>
          <div className="card-sub">Accepted format, max size, and routing for each document.</div>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Document</th><th>Routed to</th><th>Format</th><th>Max MB</th><th>Active</th><th></th></tr></thead>
            <tbody>
              {docTypesPagination.pageItems.map((t) => (
                <DocTypeRow
                  key={t.id}
                  t={{ id: t.id, name: t.name, acceptedFormats: t.acceptedFormats, maxSizeMb: t.maxSizeMb, active: t.active }}
                  deptLabel={DEPT_LABEL[t.departmentKey] ?? t.departmentKey}
                  formats={DOC_FORMATS}
                />
              ))}
            </tbody>
          </table>
          <Pagination paramKey="docTypesPage" page={docTypesPagination.page} totalPages={docTypesPagination.totalPages} />
        </div>
        <div className="card-pad">
          <div className="section-label">Add a document type</div>
          <AddDocumentTypeForm depts={reviewDepts.map((d) => ({ id: d.id, label: DEPT_LABEL[d.key] ?? d.name }))} formats={DOC_FORMATS as unknown as string[]} />
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <div className="card-pad" style={{ paddingBottom: 0 }}>
          <div className="card-title">Buyer document templates</div>
          <div className="card-sub">Documents the buyer sends to the vendor. NDA is always sent automatically; MSA is offered and pre-checked when sending an invite.</div>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Document</th><th>Routed to</th><th>File</th><th>Active</th><th></th></tr></thead>
            <tbody>
              {templatesPagination.pageItems.map((t) => (
                <tr key={t.id} style={t.active ? undefined : { opacity: 0.55 }}>
                  <td className="strong">{t.name}</td>
                  <td>{DEPT_LABEL[t.departmentKey] ?? t.departmentKey}</td>
                  <td><BuyerDocTemplateFileCell templateId={t.id} filename={t.filename} sizeKb={t.sizeKb} /></td>
                  <td>{t.active ? <span className="chip good">Active</span> : <span className="chip neutral">Inactive</span>}</td>
                  <td>
                    <form action={setBuyerDocTemplateActive}>
                      <input type="hidden" name="id" value={t.id} />
                      <input type="hidden" name="active" value={t.active ? "false" : "true"} />
                      <button className={`btn sm ${t.active ? "danger" : ""}`}>{t.active ? "Remove" : "Restore"}</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination paramKey="templatesPage" page={templatesPagination.page} totalPages={templatesPagination.totalPages} />
        </div>
      </div>
    </Shell>
  );
}
