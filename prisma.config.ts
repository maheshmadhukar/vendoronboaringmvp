import path from "node:path";
import "dotenv/config";
import { defineConfig } from "prisma/config";
import { PrismaLibSQL } from "@prisma/adapter-libsql";

/**
 * `prisma db push` / `migrate` validate DATABASE_URL against the "sqlite"
 * provider's file: protocol before any app code runs, so a remote Turso
 * libsql:// URL fails validation unless the CLI is told to route through
 * the libSQL driver adapter instead. Mirrors the runtime resolution in
 * lib/prisma.ts.
 */
function resolveDatabaseUrl(url: string): string {
  if (!url.startsWith("file:")) return url;
  const relativePath = url.slice("file:".length);
  return `file:${path.resolve(__dirname, "prisma", relativePath)}`;
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  experimental: { adapter: true },
  engine: "js",
  adapter: async () =>
    new PrismaLibSQL({
      url: resolveDatabaseUrl(
        (process.env.TURSO_DATABASE_URL ?? process.env.DATABASE_URL) as string,
      ),
      authToken: process.env.TURSO_AUTH_TOKEN ?? process.env.DATABASE_AUTH_TOKEN,
    }),
});
