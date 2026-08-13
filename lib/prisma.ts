import { PrismaClient } from "@prisma/client";

// Standard Prisma client against Supabase Postgres. The runtime DATABASE_URL is
// the Supabase transaction pooler (pgBouncer); prisma migrate/db push use
// DIRECT_URL (see schema.prisma datasource). A single client is cached on
// globalThis in dev to survive hot-reload.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ log: ["error", "warn"] });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
