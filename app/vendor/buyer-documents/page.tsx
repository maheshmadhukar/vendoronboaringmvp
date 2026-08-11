import Shell from "@/app/components/Shell";
import { Empty } from "@/app/components/ui";
import { requireVendor } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getDocumentContent } from "@/lib/documentContent";
import { fmtDate } from "@/lib/format";
import { signBuyerDoc } from "@/app/actions/vendor";

export default async function BuyerDocumentsPage() {
  const user = await requireVendor();
  const vendor = await prisma.vendor.findUnique({ where: { id: user.vendorId! } });
  if (!vendor) return null;

  const docs = await prisma.vendorBuyerDoc.findMany({
    where: { vendorId: vendor.id },
    include: { template: true },
    orderBy: { template: { order: "asc" } },
  });

  return (
    <Shell active="buyerdocs" title="Buyer Documents">
      <div className="page-head">
        <div>
          <h1>Buyer Documents</h1>
          <p>Reference documents provided by the buyer for this engagement. Read-only.</p>
        </div>
      </div>

      {docs.length === 0 ? (
        <div className="card card-pad">
          <Empty title="No buyer documents yet" hint="The buyer hasn't attached any documents to your onboarding." />
        </div>
      ) : (
        docs.map((d) => {
          const content = getDocumentContent(d.template.key, vendor);
          return (
            <div className="card card-pad" key={d.id} style={{ marginBottom: 18 }}>
              <div className="page-head" style={{ marginBottom: 14 }}>
                <div className="section-label" style={{ margin: 0 }}>{d.template.name}</div>
                {d.signedAt ? (
                  <span className="chip good">✓ Signed by {d.signedByName} on {fmtDate(d.signedAt)}</span>
                ) : (
                  <form action={signBuyerDoc}>
                    <input type="hidden" name="id" value={d.id} />
                    <button className="btn sm primary">Sign &amp; Accept</button>
                  </form>
                )}
              </div>
              {content.kind === "rich" ? (
                <div className="doc-paper">
                  {content.sections.map((s, i) => (
                    <div key={i}>
                      <h6>{s.heading}</h6>
                      <p>{s.body}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted" style={{ fontSize: 13 }}>No preview available for this document.</p>
              )}
            </div>
          );
        })
      )}
    </Shell>
  );
}
