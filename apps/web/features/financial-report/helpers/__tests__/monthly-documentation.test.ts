import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CHANGELOG } from "@/features/changelog/data/changelog";
import { FAQ_WORKFLOWS } from "@/features/ai-assistant/workflows/workflow-catalog";
import { HELP_ROLE_CONTENT } from "@/features/help-documentation/components/HelpContent";

describe("monthly financial export user guidance", () => {
  it("publishes the monthly export with an available safe screenshot and three actual steps", () => {
    const entry = CHANGELOG.find(item => item.id === "monthly-financial-excel-template");
    expect(entry).toBeDefined();
    expect(entry?.date).toBe("2026-10-21");
    expect(entry?.steps).toHaveLength(3);
    expect(entry!.summary.length).toBeLessThanOrEqual(220);
    expect(entry?.highlight.title.length).toBeLessThanOrEqual(40);
    expect(entry?.highlight.summary.length).toBeLessThanOrEqual(85);
    expect(existsSync(path.join(process.cwd(), "public", entry!.screenshot!.src))).toBe(true);
  });

  it("teaches month selection and manual capital without claiming monthly templates from chat", () => {
    const workflow = FAQ_WORKFLOWS.find(item => item.id === "faq-q21-export-financial-report");
    const content = JSON.stringify(workflow?.steps);
    expect(content).toContain("bulan dan tahun");
    expect(content).toContain("modal awal");
    expect(content).toContain("Jurnal transaksi");
    const faq = readFileSync(path.join(process.cwd(), "features/ai-assistant/docs/help/faq.md"), "utf8");
    const exportFaq = faq.slice(faq.indexOf("### Q21:"), faq.indexOf("### Q22:"));
    expect(exportFaq).toContain("bulan dan tahun");
    expect(exportFaq).toContain("modal awal");
    expect(exportFaq).toContain("Jurnal transaksi");
    expect(exportFaq).toContain("tujuh sheet");
    for (const role of ["OWNER", "ADMIN"]) {
      const guide = HELP_ROLE_CONTENT[role].find(item => item.id === `${role.toLowerCase()}-export-reports`)!;
      const guideText = JSON.stringify(guide.steps);
      expect(guideText).toContain("bulan dan tahun");
      expect(guideText).toContain("modal awal");
      expect(guideText).toContain("Jurnal transaksi");
      for (const step of guide.steps) {
        expect(step.visual?.page).toBe("finance");
        expect(step.visual?.target).toBeTruthy();
      }
      expect(guide.steps.at(-1)?.visual?.target).toBe("finance-export");
    }
  });
});
