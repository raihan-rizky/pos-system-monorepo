import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("production workflow browser setup", () => {
  it("installs Chromium before unit tests that launch a browser", () => {
    const workflow = readFileSync(path.resolve(process.cwd(), "../../.github/workflows/production.yml"), "utf8");
    const install = workflow.indexOf("- name: Install Playwright browsers");
    const unitTests = workflow.indexOf("- name: Unit tests");
    expect(install).toBeGreaterThan(-1);
    expect(unitTests).toBeGreaterThan(install);
  });
});
