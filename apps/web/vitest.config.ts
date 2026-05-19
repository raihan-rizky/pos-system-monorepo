import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["features/**/__tests__/**/*.test.ts", "app/**/__tests__/**/*.test.ts"],
    // Run tests serially to avoid Prisma prepared statement conflicts
    pool: "threads",
    singleThread: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
      "@pos/db": path.resolve(__dirname, "../../packages/db"),
    },
  },
});
