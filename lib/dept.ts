import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { requireDept } from "./session";
import { getBuyerCoveredKeys } from "./vendor";

/** Load a document routed to THIS dept user's department (horizontal RBAC). */
export async function loadOwnedDocument(documentId: string) {
  const user = await requireDept();
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: { documentType: true, vendor: true },
  });
  if (!document || document.documentType.departmentKey !== user.department!.key) redirect("/unauthorized");
  // Buyer-covered documents (e.g. MSA/NDA the buyer already sent) aren't the
  // department's to review, even by direct URL.
  const coveredKeys = await getBuyerCoveredKeys(document.vendorId);
  if (coveredKeys.has(document.documentType.key)) redirect("/unauthorized");
  return { user, document: document! };
}
