import "dotenv/config";
import { defineConfig } from "prisma/config";

// prisma.config.ts disables Prisma's automatic .env loading, so we load it
// explicitly. `prisma db push` / migrate read DIRECT_URL via the datasource's
// directUrl; the app runtime uses the pooled DATABASE_URL.
export default defineConfig({
  schema: "prisma/schema.prisma",
});
