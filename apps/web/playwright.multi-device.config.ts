import { defineConfig, devices } from "@playwright/test";

const required = ["PLAYWRIGHT_BASE_URL", "POS_MULTI_DEVICE_USERNAME", "POS_MULTI_DEVICE_PASSWORD"] as const;
const missing = required.filter(key => !process.env[key]);
if (missing.length > 0) throw new Error(`Missing test environment variables: ${missing.join(", ")}`);

const baseURL = new URL(process.env.PLAYWRIGHT_BASE_URL!);
const testHosts = ["localhost", "127.0.0.1", "[::1]", "app-teladan-pos-84d9ee-dev.abyte.my.id"];
if (!testHosts.includes(baseURL.hostname)) throw new Error("Use a local or dedicated POS development host.");

export default defineConfig({
  testDir: "./e2e",
  testMatch: "multi-device-auth.spec.ts",
  workers: 1,
  timeout: 120_000,
  projects: [{
    name: "multi-device-auth",
    use: { ...devices["Desktop Chrome"], baseURL: baseURL.href, trace: "off", screenshot: "off", video: "off" },
  }],
});
