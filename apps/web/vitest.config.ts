import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: [
      "features/**/__tests__/**/*.test.ts",
      "features/**/__tests__/**/*.test.tsx",
      "app/**/__tests__/**/*.test.ts",
      "lib/**/__tests__/**/*.test.ts",
    ],
    // Run tests serially to avoid Prisma prepared statement conflicts
    pool: "threads",
    fileParallelism: false,
    maxWorkers: 1,
  },
  // Vite 8 uses oxc for JSX transform; vitest type defs don't expose it yet
  oxc: {
    jsx: "automatic",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
      "@pos/db": path.resolve(__dirname, "../../packages/db"),
    },
  },
} as any);

