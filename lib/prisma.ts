import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * A local "file:" DATABASE_URL is written relative to prisma/schema.prisma
 * (matching how the Prisma CLI resolves it for `db push`/seed), but the raw
 * libSQL client resolves "file:" paths relative to process.cwd() instead —
 * so re-root it here. Remote Turso "libsql://..." URLs pass through untouched.
 */
function resolveDatabaseUrl(url: string): string {
  if (!url.startsWith("file:")) return url;
  const relativePath = url.slice("file:".length);
  return `file:${path.resolve(process.cwd(), "prisma", relativePath)}`;
}

const adapter = new PrismaLibSQL({
  url: resolveDatabaseUrl(process.env.DATABASE_URL as string),
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ adapter, log: ["error", "warn"] });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
