// One-off: attach an unsigned NDA VendorBuyerDoc to every vendor missing one,
// now that NDA is always sent. Idempotent — safe to re-run.
import { prisma } from "../lib/prisma";

async function main() {
  const nda = await prisma.buyerDocTemplate.findFirst({ where: { key: "NDA" } });
  if (!nda) throw new Error("No NDA BuyerDocTemplate found — seed/config it first.");

  const vendors = await prisma.vendor.findMany({
    where: { buyerDocs: { none: { templateId: nda.id } } },
    select: { id: true, name: true },
  });
  console.log(`${vendors.length} vendor(s) missing NDA — backfilling (unsigned)...`);
  if (vendors.length) {
    await prisma.vendorBuyerDoc.createMany({
      data: vendors.map((v) => ({ vendorId: v.id, templateId: nda.id })),
    });
    for (const v of vendors) console.log(`  + ${v.name}`);
  }
  console.log("Done.");
}

main().finally(() => prisma.$disconnect());
