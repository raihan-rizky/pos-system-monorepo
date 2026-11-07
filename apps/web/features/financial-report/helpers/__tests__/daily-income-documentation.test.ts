import { describe, expect, it } from "vitest";
import { FAQ_WORKFLOWS } from "@/features/ai-assistant/workflows/workflow-catalog";
import { HELP_ROLE_CONTENT } from "@/features/help-documentation/components/HelpContent";
import { CHANGELOG } from "@/features/changelog/data/changelog";

describe("daily income guidance", () => {
  it("offers a daily workflow without requiring the full-report permission", () => {
    const workflow = FAQ_WORKFLOWS.find(row => row.id === "faq-q52-daily-income");
    expect(workflow).toBeDefined();
    expect(workflow?.route).toBe("/financial-report");
    expect(workflow?.requiredCapabilities).toEqual([{ resource: "financial-report.daily-income", action: "read" }]);
    expect(JSON.stringify(workflow?.steps)).toContain("WIB");
    expect(JSON.stringify(workflow?.steps)).toContain("metode pembayaran");
  });
  it("helps SALES understand their daily-only view and the four separate permissions", () => {
    const guide = HELP_ROLE_CONTENT.SALES.find(row => row.id === "sales-daily-income");
    expect(guide).toBeDefined();
    const text = JSON.stringify(guide);
    for (const word of ["ATK", "Percetakan", "subkategori", "metode pembayaran", "WIB"]) expect(text).toContain(word);
    expect(guide?.steps).toHaveLength(3);
    expect(guide?.steps.every(row => row.visual?.page === "finance")).toBe(true);
  });
  it("publishes a concise dated announcement with exactly three usage steps", () => {
    const entry = CHANGELOG.find(row => row.id === "daily-finance-sales-rbac");
    expect(entry).toMatchObject({ date: "2026-11-05", revision: 1, href: "/financial-report", visual: "financial" });
    expect(entry?.steps).toHaveLength(3);
    expect(entry!.highlight.title.length).toBeLessThanOrEqual(40);
    expect(entry!.highlight.summary.length).toBeLessThanOrEqual(85);
  });
});
