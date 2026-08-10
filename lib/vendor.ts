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

/** Group a vendor's documents by routing department key. */
export function groupDocsByDept(vendor: VendorFull) {
  const map: Record<string, VendorFull["documents"]> = {};
  for (const d of vendor.documents) {
    const k = d.documentType.departmentKey;
    (map[k] ??= []).push(d);
  }
  return map;
}
