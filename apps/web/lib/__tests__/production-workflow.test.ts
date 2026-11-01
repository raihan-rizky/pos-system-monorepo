import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Production workflow", () => {
  it("installs Chromium before running unit and E2E tests", () => {
    const workflow = readFileSync(
      resolve(process.cwd(), "../../.github/workflows/production.yml"),
      "utf8",
    );
    const install = workflow.search(/^\s*run:\s*pnpm --filter @pos\/web exec playwright install --with-deps chromium\s*$/m);
    const unitTests = workflow.search(/^\s*run:\s*pnpm test\s*$/m);
    const e2eTests = workflow.search(/^\s*run:\s*pnpm e2e\s*$/m);

    expect(install).toBeGreaterThanOrEqual(0);
    expect(unitTests).toBeGreaterThanOrEqual(0);
    expect(e2eTests).toBeGreaterThanOrEqual(0);
    expect(install).toBeLessThan(unitTests);
    expect(install).toBeLessThan(e2eTests);
  });
});
