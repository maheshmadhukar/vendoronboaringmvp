import Shell from "@/app/components/Shell";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/workflow";
import { DEPT_LABEL } from "@/lib/constants";
import { updateDocType, setDocumentTypeActive } from "@/app/actions/admin";
import ConfigForm from "./ConfigForm";
import AddDocumentTypeForm from "./AddDocumentTypeForm";
import BuyerDocTemplateFileCell from "./BuyerDocTemplateFileCell";

const DOC_FORMATS = ["doc", "pdf", "jpeg"] as const;

export default async function ConfigPage() {
  await requireAdmin();
  const cfg = await getConfig();
  const depts = await prisma.department.findMany({ orderBy: { name: "asc" } });
  const docTypes = await prisma.documentType.findMany({ orderBy: { order: "asc" } });
  const buyerDocTemplates = await prisma.buyerDocTemplate.findMany({ orderBy: { order: "asc" } });

  return (
    <Shell active="config" title="Configuration">
      <div className="page-head">
        <div><h1>Configuration</h1><p>SLA rules, cutoff logic, approval gates, notifications, and document requirements.</p></div>
      </div>

      <div className="card card-pad">
        <div className="card-title">SLA, gates &amp; notifications</div>
        <ConfigForm cfg={cfg} depts={depts} />
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <div className="card-pad" style={{ paddingBottom: 0 }}>
          <div className="card-title">Document requirements</div>
          <div className="card-sub">Accepted format, max size, and whether each document is mandatory. Routing shows which department reviews it.</div>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Document</th><th>Routed to</th><th>Format</th><th>Max MB</th><th>Mandatory</th><th>Active</th><th></th></tr></thead>
            <tbody>
              {docTypes.map((t) => (
                <tr key={t.id} style={t.active ? undefined : { opacity: 0.55 }}>
                  <td className="strong">{t.name}</td>
                  <td>{DEPT_LABEL[t.departmentKey] ?? t.departmentKey}</td>
                  <td>
                    <form action={updateDocType} id={`dt-${t.id}`} style={{ display: "contents" }}>
                      <input type="hidden" name="id" value={t.id} />
                      <select name="acceptedFormats" defaultValue={DOC_FORMATS.includes(t.acceptedFormats as never) ? t.acceptedFormats : "doc"} style={{ fontSize: 12, padding: "4px 8px" }}>
                        {DOC_FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </form>
                  </td>
                  <td><input form={`dt-${t.id}`} name="maxSizeMb" type="number" defaultValue={t.maxSizeMb} style={{ width: 64, fontSize: 12, padding: "4px 8px" }} /></td>
                  <td><input form={`dt-${t.id}`} name="mandatory" type="checkbox" defaultChecked={t.mandatory} /></td>
                  <td>{t.active ? <span className="chip good">Active</span> : <span className="chip neutral">Inactive</span>}</td>
                  <td style={{ display: "flex", gap: 6 }}>
                    <button form={`dt-${t.id}`} className="btn sm">Save</button>
                    <form action={setDocumentTypeActive}>
                      <input type="hidden" name="id" value={t.id} />
                      <input type="hidden" name="active" value={t.active ? "false" : "true"} />
                      <button className={`btn sm ${t.active ? "danger" : ""}`}>{t.active ? "Remove" : "Restore"}</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card-pad">
          <div className="section-label">Add a document type</div>
          <AddDocumentTypeForm depts={depts.map((d) => ({ id: d.id, label: DEPT_LABEL[d.key] ?? d.name }))} formats={DOC_FORMATS as unknown as string[]} />
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <div className="card-pad" style={{ paddingBottom: 0 }}>
          <div className="card-title">Buyer document templates</div>
          <div className="card-sub">Documents the buyer sends to the vendor. NDA is always sent automatically; MSA is offered and pre-checked when sending an invite.</div>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Document</th><th>Routed to</th><th>File</th><th>Active</th></tr></thead>
            <tbody>
              {buyerDocTemplates.map((t) => (
                <tr key={t.id} style={t.active ? undefined : { opacity: 0.55 }}>
                  <td className="strong">{t.name}</td>
                  <td>{DEPT_LABEL[t.departmentKey] ?? t.departmentKey}</td>
                  <td><BuyerDocTemplateFileCell templateId={t.id} filename={t.filename} sizeKb={t.sizeKb} /></td>
                  <td>{t.active ? <span className="chip good">Active</span> : <span className="chip neutral">Inactive</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}
