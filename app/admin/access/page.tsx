import Shell from "@/app/components/Shell";
import { Chip } from "@/app/components/ui";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { ROLE, DEPT_LABEL, DEPT_ORDER } from "@/lib/constants";
import { setUserActive, assignManager } from "@/app/actions/admin";
import InviteVendorForm from "./InviteVendorForm";

export default async function AccessPage() {
  await requireAdmin();
  const users = await prisma.user.findMany({ include: { department: true }, orderBy: [{ role: "asc" }, { name: "asc" }] });
  const depts = await prisma.department.findMany({ include: { users: true }, orderBy: { name: "asc" } });
  const invites = await prisma.invite.findMany({ where: { consumedAt: null }, orderBy: { createdAt: "desc" }, take: 10 });

  const internal = users.filter((u) => u.role !== ROLE.VENDOR);
  const vendors = users.filter((u) => u.role === ROLE.VENDOR);

  return (
    <Shell active="access" title="Access & Invites">
      <div className="page-head">
        <div><h1>Access &amp; Invites</h1><p>Invite vendors, grant or revoke internal access, and assign department managers.</p></div>
      </div>

      <div className="card card-pad">
        <div className="card-title">Invite a vendor</div>
        <div className="card-sub">Buyer-initiated onboarding only — this sends an invite link + OTP sign-up.</div>
        <InviteVendorForm />
      </div>

      {invites.length > 0 ? (
        <div className="card card-pad" style={{ marginTop: 18 }}>
          <div className="section-label">Open invites</div>
          {invites.map((i) => (
            <div className="notif" key={i.id}>
              <span>{i.email}</span>
              <a className="row-link" href={`/invite/${i.token}`}>/invite/{i.token.slice(0, 12)}…</a>
            </div>
          ))}
        </div>
      ) : null}

      <div className="card" style={{ marginTop: 18 }}>
        <div className="card-pad" style={{ paddingBottom: 0 }}><div className="section-label">Internal users</div></div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Name</th><th>Role</th><th>Department</th><th>Access</th><th></th></tr></thead>
            <tbody>
              {internal.map((u) => (
                <tr key={u.id}>
                  <td><div className="strong">{u.name}</div><div className="sub">{u.email}</div></td>
                  <td>{u.role === ROLE.ADMIN ? "Admin" : "Dept user"}{u.managerRole ? ` · ${u.managerRole.toLowerCase()}` : ""}</td>
                  <td>{u.department ? DEPT_LABEL[u.department.key] : "—"}</td>
                  <td>{u.active ? <Chip tone="good">active</Chip> : <Chip tone="neutral">revoked</Chip>}</td>
                  <td>
                    {u.role !== ROLE.ADMIN ? (
                      <form action={setUserActive}>
                        <input type="hidden" name="userId" value={u.id} />
                        <input type="hidden" name="active" value={u.active ? "false" : "true"} />
                        <button className="btn sm">{u.active ? "Revoke" : "Grant"}</button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <div className="card-pad" style={{ paddingBottom: 0 }}><div className="section-label">Department managers</div></div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Department</th><th>Primary</th><th>Secondary</th><th>Reassign primary</th></tr></thead>
            <tbody>
              {DEPT_ORDER.map((k) => {
                const d = depts.find((x) => x.key === k);
                if (!d) return null;
                const primary = d.users.find((u) => u.id === d.primaryManagerId);
                const secondary = d.users.find((u) => u.id === d.secondaryManagerId);
                return (
                  <tr key={k}>
                    <td className="strong">{DEPT_LABEL[k]}</td>
                    <td>{primary?.name ?? "—"}</td>
                    <td>{secondary?.name ?? "—"}</td>
                    <td>
                      <form action={assignManager} style={{ display: "flex", gap: 8 }}>
                        <input type="hidden" name="departmentId" value={d.id} />
                        <input type="hidden" name="role" value="PRIMARY" />
                        <select name="userId" defaultValue={d.primaryManagerId ?? ""} style={{ fontSize: 12, padding: "4px 8px" }}>
                          {d.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                        <button className="btn sm">Set</button>
                      </form>
                    </td>
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
