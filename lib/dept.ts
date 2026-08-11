import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { requireDept } from "./session";

/** Load a document routed to THIS dept user's department (horizontal RBAC). */
export async function loadOwnedDocument(documentId: string) {
  const user = await requireDept();
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: { documentType: true, vendor: true },
  });
  if (!document || document.documentType.departmentKey !== user.department!.key) redirect("/unauthorized");
  return { user, document: document! };
}
