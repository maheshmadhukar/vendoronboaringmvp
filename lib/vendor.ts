import { prisma } from "./prisma";

/** Load the vendor owned by a vendor user, with all related data. */
export async function getVendorFull(vendorId: string) {
  return prisma.vendor.findUnique({
    where: { id: vendorId },
    include: {
      documents: { include: { documentType: true }, orderBy: { documentType: { order: "asc" } } },
      deptReviews: { include: { department: true } },
      comments: { include: { author: true }, orderBy: { createdAt: "asc" } },
    },
  });
}

export type VendorFull = NonNullable<Awaited<ReturnType<typeof getVendorFull>>>;

export async function getDocTypes() {
  return prisma.documentType.findMany({ where: { active: true }, orderBy: { order: "asc" } });
}

/**
 * DocumentType keys covered by a buyer-provided document already attached to
 * this vendor (e.g. the buyer sent their own MSA at invite time) — the
 * vendor doesn't need to upload one, and departments don't need to review one.
 */
export async function getBuyerCoveredKeys(vendorId: string): Promise<Set<string>> {
  const buyerDocs = await prisma.vendorBuyerDoc.findMany({ where: { vendorId }, include: { template: true } });
  return new Set(buyerDocs.map((d) => d.template.key));
}

/** Active document types the vendor still needs to upload themselves, excluding buyer-covered ones. */
export async function getVendorDocTypes(vendorId: string) {
  const [types, coveredKeys] = await Promise.all([getDocTypes(), getBuyerCoveredKeys(vendorId)]);
  return types.filter((t) => !coveredKeys.has(t.key));
}

/** Group a vendor's documents by routing department key. */
export function groupDocsByDept(vendor: VendorFull) {
  const map: Record<string, VendorFull["documents"]> = {};
  for (const d of vendor.documents) {
    const k = d.documentType.departmentKey;
    (map[k] ??= []).push(d);
  }
  return map;
}
