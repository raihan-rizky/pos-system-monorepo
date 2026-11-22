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
  it("helps SALES distinguish daily receipts from the current open DP balance", () => {
    const guide = HELP_ROLE_CONTENT.SALES.find(row => row.id === "sales-daily-income");
    expect(guide).toBeDefined();
    const text = JSON.stringify(guide);
    for (const word of ["ATK", "Percetakan", "subkategori", "metode pembayaran", "Outstanding DP", "WIB"]) expect(text).toContain(word);
    expect(guide?.steps).toHaveLength(3);
    expect(guide?.steps.every(row => row.visual?.page === "finance")).toBe(true);
    const workflow = FAQ_WORKFLOWS.find(row => row.id === "faq-q52-daily-income");
    expect(JSON.stringify(workflow)).toContain("Lihat sebagai Sales");
    expect(text).toContain("bukan saldo historis");
  });
  it("explains the OWNER preview and its saved SALES grants", () => {
    const ownerGuide = HELP_ROLE_CONTENT.OWNER.find(row => row.id === "owner-reports");
    expect(JSON.stringify(ownerGuide)).toContain("Lihat sebagai Sales");
    expect(JSON.stringify(ownerGuide)).toContain("izin Sales");
  });
  it("publishes a concise dated announcement with exactly three usage steps", () => {
    const entry = CHANGELOG.find(row => row.id === "daily-finance-sales-outstanding-owner-view");
    expect(entry).toMatchObject({ date: "2026-11-07", revision: 1, href: "/financial-report", visual: "financial" });
    expect(entry?.steps).toHaveLength(3);
    expect(entry!.highlight.title.length).toBeLessThanOrEqual(40);
    expect(entry!.highlight.summary.length).toBeLessThanOrEqual(85);
  });
  it("explains the receipt-date drilldown and announces the reconciled views", () => {
    const guide = HELP_ROLE_CONTENT.SALES.find(row => row.id === "sales-daily-income");
    const workflow = FAQ_WORKFLOWS.find(row => row.id === "faq-q52-daily-income");
    for (const text of [JSON.stringify(guide), JSON.stringify(workflow)]) {
      expect(text).toContain("Harian");
      expect(text).toContain("Riwayat");
      expect(text).toContain("pelunasan nota lama");
    }
    const entry = CHANGELOG.find(row => row.id === "sales-penerimaan-riwayat-selaraskan");
    expect(entry).toMatchObject({ date: "2026-11-11", revision: 1, href: "/financial-report", visual: "financial" });
    expect(entry?.steps).toHaveLength(3);
  });
});
