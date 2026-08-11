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
 * Active document types the vendor still needs to upload themselves, excluding
 * any whose key matches a buyer-provided document already attached to them
 * (e.g. if the buyer sent their own MSA at invite time, the vendor doesn't
 * also need to upload an MSA under Documents).
 */
export async function getVendorDocTypes(vendorId: string) {
  const [types, buyerDocs] = await Promise.all([
    getDocTypes(),
    prisma.vendorBuyerDoc.findMany({ where: { vendorId }, include: { template: true } }),
  ]);
  const coveredKeys = new Set(buyerDocs.map((d) => d.template.key));
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
