import Shell from "@/app/components/Shell";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/workflow";
import { DEPT_LABEL } from "@/lib/constants";
import { updateDocType } from "@/app/actions/admin";
import ConfigForm from "./ConfigForm";

export default async function ConfigPage() {
  await requireAdmin();
  const cfg = await getConfig();
  const depts = await prisma.department.findMany({ orderBy: { name: "asc" } });
  const docTypes = await prisma.documentType.findMany({ orderBy: { order: "asc" } });

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
          <div className="card-sub">Accepted formats, max size, and whether each document is mandatory. Routing shows which department reviews it.</div>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Document</th><th>Routed to</th><th>Formats</th><th>Max MB</th><th>Mandatory</th><th></th></tr></thead>
            <tbody>
              {docTypes.map((t) => (
                <tr key={t.id}>
                  <td className="strong">{t.name}</td>
                  <td>{DEPT_LABEL[t.departmentKey]}</td>
                  <td>
                    <form action={updateDocType} id={`dt-${t.id}`} style={{ display: "contents" }}>
                      <input type="hidden" name="id" value={t.id} />
                      <input name="acceptedFormats" defaultValue={t.acceptedFormats} style={{ width: 90, fontSize: 12, padding: "4px 8px" }} />
                    </form>
                  </td>
                  <td><input form={`dt-${t.id}`} name="maxSizeMb" type="number" defaultValue={t.maxSizeMb} style={{ width: 64, fontSize: 12, padding: "4px 8px" }} /></td>
                  <td><input form={`dt-${t.id}`} name="mandatory" type="checkbox" defaultChecked={t.mandatory} /></td>
                  <td><button form={`dt-${t.id}`} className="btn sm">Save</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}
