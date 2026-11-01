import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { HELP_ROLE_CONTENT } from "../components/HelpContent";
import { FAQ_WORKFLOWS } from "@/features/ai-assistant/workflows/workflow-catalog";
import { CHANGELOG } from "@/features/changelog/data/changelog";

it("guides cashiers through PIN preparation, offline reopening, and reconciliation", () => {
  for (const role of ["OWNER", "ADMIN", "CASHIER", "SALES"]) {
    const guide = HELP_ROLE_CONTENT[role].find((item) => item.id === `${role.toLowerCase()}-offline-sync`);
    const description = guide?.steps.map((step) => step.description).join(" ");
    expect(description).toContain("PIN offline");
    expect(description).toContain("belum terenkripsi");
    expect(description).toContain("Buka POS offline");
  }
  const workflow = FAQ_WORKFLOWS.find((item) => item.faqNumber === 45);
  expect(workflow?.route).toBe("/pos/offline");
  expect(workflow?.steps.map((step) => step.description).join(" ")).toContain("PIN offline");
  const faq = readFileSync(new URL("../../ai-assistant/docs/help/faq.md", import.meta.url), "utf8");
  expect(faq).toContain("### Q45: Bagaimana cara menyiapkan dan memeriksa transaksi offline?");
  expect(faq).toContain("Buka POS offline");
  expect(CHANGELOG.find((entry) => entry.id === "pos-offline-sync-recovery")?.steps).toHaveLength(3);
  expect(CHANGELOG.find((entry) => entry.id === "pos-offline-sync-recovery")?.summary).toContain("PIN");
});
