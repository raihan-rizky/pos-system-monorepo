import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HELP_ROLE_CONTENT } from "../components/HelpContent";
import { VisualGuideMockup, isKnownHelpVisualTarget } from "../components/VisualGuideMockup";
import { FAQ_WORKFLOWS } from "@/features/ai-assistant/workflows/workflow-catalog";
import { getMissingWorkflowRequirements } from "@/features/ai-assistant/workflows/assistant-workflow-matcher";
import { buildDefaultRolePermissions } from "@/features/rbac/helpers/rbac-core";
import { CHANGELOG } from "@/features/changelog/data/changelog";
import { ChangeCard } from "@/features/changelog/components/ChangeCard";
import { WhatsNewDialog } from "@/features/changelog/components/WhatsNewDialog";

describe("printing receipt help and announcement", () => {
  it.each(["OWNER", "ADMIN", "CASHIER", "SALES"])("guides %s through a saved note and dependent history filters", (role) => {
    const guide = HELP_ROLE_CONTENT[role].find((item) => item.id === `${role.toLowerCase()}-printing-receipts`);
    expect(guide).toBeDefined();
    const text = guide!.steps.map((step) => step.description).join(" ");
    for (const term of ["SPANDUK", "PERCETAKAN", "PLAT", "STEMPEL", "PRINT", "Buat Nota Kosong", "Tersimpan", "DP", "Subkategori", "ATK"]) {
      expect(text, term).toContain(term);
    }
    for (const [index, step] of guide!.steps.entries()) {
      expect(isKnownHelpVisualTarget(step.visual!)).toBe(true);
      const html = renderToStaticMarkup(<VisualGuideMockup visual={step.visual!} stepNumber={index + 1} stepTitle={step.title} />);
      expect(html).toContain('data-help-target-active="true"');
    }
  });

  it("shows the printing workspace and history subtype in read-only guide visuals", () => {
    const guide = HELP_ROLE_CONTENT.CASHIER.find((item) => item.id === "cashier-printing-receipts");
    expect(guide).toBeDefined();
    const html = guide!.steps.map((step, index) => renderToStaticMarkup(<VisualGuideMockup visual={step.visual!} stepNumber={index + 1} stepTitle={step.title} />)).join("");
    expect(html).toContain("Buat Nota Kosong");
    expect(html).toContain("No. Nota");
    expect(html).toContain("Tersimpan");
    expect(html).toContain("Subkategori");
    expect(html).toContain("SPANDUK");
  });

  it("provides an assistant workflow with permission and original-note printing steps", () => {
    const workflow = FAQ_WORKFLOWS.find((item) => item.id === "faq-q40-printing-receipts");
    expect(workflow).toMatchObject({ route: "/pos" });
    for (const role of ["OWNER", "ADMIN", "CASHIER", "SALES"] as const) {
      expect(getMissingWorkflowRequirements(workflow!, role, buildDefaultRolePermissions())).toEqual([]);
    }
    const text = workflow!.steps.map((step) => step.description).join(" ");
    expect(text).toContain("Buat Nota Kosong");
    expect(text).toContain("Tersimpan");
    expect(text).toContain("Riwayat");
    expect(text).toContain("Subkategori");
    expect(text).toContain("template asal");
  });

  it("publishes concise printing release notes with three usage steps and a sample-data screenshot", () => {
    const entry = CHANGELOG.find((item) => item.id === "printing-receipts-pos");
    expect(entry).toMatchObject({ date: "2026-10-20", revision: 1, href: "/pos", visual: "printing" });
    expect(entry!.steps).toHaveLength(3);
    expect(entry!.highlight.title.length).toBeLessThanOrEqual(40);
    expect(entry!.highlight.summary.length).toBeLessThanOrEqual(85);
    const html = renderToStaticMarkup(<ChangeCard entry={entry!} />);
    expect(html).toContain('/images/changelog/nota-percetakan.png');
    expect(html).toContain("data contoh");
    expect(html).toContain("SPANDUK");
    expect(html).toContain("Buat Nota Kosong");
  });

  it("announces printing notes in the weekly popup with a valid feature icon", () => {
    const entry = CHANGELOG.find((item) => item.id === "printing-receipts-pos")!;
    const html = renderToStaticMarkup(<WhatsNewDialog entries={[entry]} onClose={() => {}} canAccess={() => true} />);
    expect(html).toContain(entry.highlight.title);
    expect(html).toContain(entry.highlight.summary);
    expect(html).toContain('href="/pos"');
  });
});
