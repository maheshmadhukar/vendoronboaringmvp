import Link from "next/link";
import { redirect } from "next/navigation";
import Shell from "@/app/components/Shell";
import { Chip, Empty } from "@/app/components/ui";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { DEPT_LABEL, DEPT_ORDER, VSTATUS } from "@/lib/constants";
import { fmtDate } from "@/lib/format";

export default async function OnboardedVendorDocuments({ params }: { params: Promise<{ vendorId: string }> }) {
  await requireAdmin();
  const { vendorId } = await params;

  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    include: { documents: { include: { documentType: true } } },
  });
  if (!vendor || vendor.status !== VSTATUS.ONBOARDED) redirect("/dept");

  const groups = DEPT_ORDER.map((k) => ({
    key: k,
    items: vendor.documents.filter((d) => d.documentType.departmentKey === k),
  })).filter((g) => g.items.length > 0);

  return (
    <Shell
      active="procurement"
      title={vendor.name}
      crumbs={<><Link href="/dept">Procurement Review</Link><span className="crumb-sep">/</span>{vendor.name}</>}
    >
      <div className="page-head">
        <div>
          <h1>{vendor.name}</h1>
          <p>Onboarded {fmtDate(vendor.onboardedAt)} · {vendor.category}</p>
        </div>
        <Chip tone="good">Onboarded</Chip>
      </div>

      {groups.length === 0 ? (
        <Empty title="No documents on file" />
      ) : (
        groups.map((g) => (
          <div className="card card-pad" key={g.key} style={{ marginBottom: 18 }}>
            <div className="section-label">{DEPT_LABEL[g.key]} documents</div>
            {g.items.map((d) => (
              <div className="doc-row" key={d.id}>
                <div className="doc-ico" />
                <div className="doc-info">
                  <div className="doc-name">{d.documentType.name}</div>
                  <div className="doc-meta">
                    {d.filename ?? "not uploaded"}{d.sizeKb ? ` · ${d.sizeKb} KB` : ""} · {fmtDate(d.uploadedAt)}
                  </div>
                </div>
                <div className="doc-actions">
                  <Link className="btn sm ghost" href={`/dept/onboarded/${vendor.id}/document/${d.id}`}>View document</Link>
                </div>
              </div>
            ))}
          </div>
        ))
      )}
    </Shell>
  );
}
