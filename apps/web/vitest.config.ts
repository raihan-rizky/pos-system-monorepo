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
      "app/**/__tests__/**/*.test.tsx",
      "lib/**/__tests__/**/*.test.ts",
    ],
    pool: "threads",
    fileParallelism: false,
    maxWorkers: 1,
  },
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
