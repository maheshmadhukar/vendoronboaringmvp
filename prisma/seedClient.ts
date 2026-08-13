import "dotenv/config";
import { PrismaClient } from "@prisma/client";

// Seeding runs many sequential statements. The transaction pooler (DATABASE_URL,
// :6543) recycles connections mid-run (P1017), so the seed uses the direct /
// session connection (DIRECT_URL, :5432) — the same channel Prisma migrate uses.
// connection_limit=1 pins a single connection so the `SET statement_timeout = 0`
// issued at the start of seeding applies to every subsequent statement.
function seedUrl(): string {
  const base = process.env.DIRECT_URL || process.env.DATABASE_URL || "";
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}connection_limit=1`;
}

export const prisma = new PrismaClient({ datasourceUrl: seedUrl() });
