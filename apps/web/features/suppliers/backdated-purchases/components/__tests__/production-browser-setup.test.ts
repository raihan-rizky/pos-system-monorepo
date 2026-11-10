import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("production workflow browser setup", () => {
  it("installs Chromium before unit tests that launch a browser", () => {
    const workflow = readFileSync(path.resolve(process.cwd(), "../../.github/workflows/ci.yml"), "utf8");
    const install = workflow.indexOf("- name: Instal Chromium untuk tes browser");
    const unitTests = workflow.indexOf("- name: Unit test");
    expect(install).toBeGreaterThan(-1);
    expect(unitTests).toBeGreaterThan(install);
  });
});
