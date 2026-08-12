import Shell from "@/app/components/Shell";
import { Chip } from "@/app/components/ui";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { ROLE, DEPT, DEPT_LABEL, DEPT_ORDER } from "@/lib/constants";
import { setUserActive } from "@/app/actions/admin";
import InviteVendorForm from "./InviteVendorForm";
import EditManagerEmailForm from "./EditManagerEmailForm";

export default async function AccessPage() {
  await requireAdmin();
  const users = await prisma.user.findMany({ include: { department: true }, orderBy: [{ role: "asc" }, { name: "asc" }] });
  const depts = await prisma.department.findMany({ include: { users: true }, orderBy: { name: "asc" } });
  const buyerDocTemplates = await prisma.buyerDocTemplate.findMany({ where: { active: true }, orderBy: { order: "asc" } });

  const vendors = users.filter((u) => u.role === ROLE.VENDOR);

  return (
    <Shell active="access" title="Access & Invites">
      <div className="page-head">
        <div><h1>Access &amp; Invites</h1><p>Invite vendors, grant or revoke internal access, and assign department managers.</p></div>
      </div>

      <div className="card card-pad">
        <div className="card-title">Invite a vendor</div>
        <div className="card-sub">Buyer-initiated onboarding only — this sends an invite link + OTP sign-up.</div>
        <InviteVendorForm templates={buyerDocTemplates.map((t) => ({ id: t.id, name: t.name }))} />
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <div className="card-pad" style={{ paddingBottom: 0 }}><div className="section-label">Department managers</div></div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Department</th><th>Manager</th><th>Email</th></tr></thead>
            <tbody>
              {DEPT_ORDER.filter((k) => k !== DEPT.PROCUREMENT).map((k) => {
                const d = depts.find((x) => x.key === k);
                if (!d) return null;
                const manager = d.users.find((u) => u.id === d.managerId);
                return (
                  <tr key={k}>
                    <td className="strong">{DEPT_LABEL[k]}</td>
                    <td>{manager?.name ?? "—"}</td>
                    <td>{manager ? <EditManagerEmailForm userId={manager.id} currentEmail={manager.email} /> : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <div className="card-pad" style={{ paddingBottom: 0 }}><div className="section-label">Vendor accounts</div></div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Vendor contact</th><th>Access</th><th></th></tr></thead>
            <tbody>
              {vendors.length === 0 ? <tr><td colSpan={3} className="muted">No vendor accounts yet.</td></tr> :
                vendors.map((u) => (
                  <tr key={u.id}>
                    <td><div className="strong">{u.name}</div><div className="sub">{u.email}</div></td>
                    <td>{u.active ? <Chip tone="good">active</Chip> : <Chip tone="neutral">inactive</Chip>}</td>
                    <td>
                      <form action={setUserActive}>
                        <input type="hidden" name="userId" value={u.id} />
                        <input type="hidden" name="active" value={u.active ? "false" : "true"} />
                        <button className="btn sm">{u.active ? "Revoke" : "Grant"}</button>
                      </form>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}
