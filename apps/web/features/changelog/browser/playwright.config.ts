import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "changelog.spec.ts",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: { channel: "chrome", headless: true, viewport: { width: 1365, height: 1000 } },
});
