import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
    // Isolasi DB test: DATABASE_URL di-set DI SINI (level config) sehingga
    // sudah aktif SEBELUM modul test mana pun dievaluasi. Ini menutup celah
    // hoisting ESM: import statis `@/lib/db` / `@/lib/session` di file test
    // dievaluasi sebelum baris body code, sehingga jika DATABASE_URL baru
    // di-set di body test, PrismaClient akan terkunci ke dev.db asli dan
    // `npm run test` mengotori prisma/dev.db. Path-nya deterministik agar
    // beforeAll (db push) + afterAll (cleanup) bisa merujuk file yang sama.
    env: {
      DATABASE_URL: `file:${path.resolve(__dirname, "prisma", "test-vitest.db")}`,
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
