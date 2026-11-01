import { defineConfig, devices } from "@playwright/test";

const port = process.env.PLAYWRIGHT_PORT || "3137";
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "offline-pos-reopen.spec.ts",
  timeout: 180_000,
  workers: 1,
  reporter: "line",
  use: { baseURL, ...devices["Desktop Chrome"] },
  webServer: {
    command: `node ./node_modules/next/dist/bin/next dev --turbopack --port ${port}`,
    url: `${baseURL}/manifest.json`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      E2E_AUTH_BYPASS: "1",
      NEXT_PUBLIC_E2E: "1",
      NEXT_DIST_DIR: process.env.NEXT_DIST_DIR || ".next-offline-e2e-turbo",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "e2e-anon-key",
      DATABASE_URL: "postgresql://offline_test:offline_test@127.0.0.1:1/offline_test",
    },
  },
});
