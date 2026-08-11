import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @prisma/client and @libsql/client are already on Next's default
  // server-external-packages list; @prisma/adapter-libsql isn't, and being
  // bundled breaks its runtime wiring to Prisma Client (manifests as
  // Prisma falling back to its default "DATABASE_URL must be file:" check).
  serverExternalPackages: ["@prisma/adapter-libsql"],
};

export default nextConfig;
