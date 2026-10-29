import { describe, expect, it } from "vitest";
import { HELP_ROLE_CONTENT } from "@/features/help-documentation/components/HelpContent";
import { FAQ_WORKFLOWS } from "@/features/ai-assistant/workflows/workflow-catalog";
import { CHANGELOG } from "@/features/changelog/data/changelog";

describe("guidance for moving product categories", () => {
  it("explains group members and the import restriction in Help", () => {
    const help = JSON.stringify(HELP_ROLE_CONTENT.OWNER);
    expect(help).toContain("semua satuan dalam grup stok, termasuk satuan yang tidak aktif");
    expect(help).toContain("ubah kategori grup melalui Produk sebelum mengimpor");
  });

  it("keeps assistant workflows in sync with category moves and imports", () => {
    const categories = JSON.stringify(FAQ_WORKFLOWS.find(workflow => workflow.faqNumber === 2));
    const imports = JSON.stringify(FAQ_WORKFLOWS.find(workflow => workflow.faqNumber === 4));
    expect(categories).toContain("semua satuan dalam grup stok, termasuk satuan yang tidak aktif");
    expect(imports).toContain("ubah kategori grup melalui Produk sebelum mengimpor");
  });

  it("announces the category fix with a three-step flow", () => {
    const entry = CHANGELOG.find(change => change.id === "product-category-stock-group-move");
    expect(entry).toMatchObject({ date: "2026-10-29", revision: 1, href: "/products", kind: "fix" });
    expect(entry?.steps).toHaveLength(3);
  });
});
