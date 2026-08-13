import path from "node:path";
import { defineConfig } from "vitest/config";

// Unit tests cover the pure, DB-agnostic business logic (SLA math, period
// ranges, analytics selectors). These are the invariants the Supabase DB swap
// must NOT change — run them before and after Phase 1 and diff the output.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
});
