import { describe, expect, it } from "vitest";
import { HELP_ROLE_CONTENT } from "../components/HelpContent";
import { FAQ_WORKFLOWS } from "@/features/ai-assistant/workflows/workflow-catalog";
import { CHANGELOG } from "@/features/changelog/data/changelog";

describe("panduan kategori pengeluaran khusus", () => {
  it("menjelaskan cara membuat dan memakai kategori di Bantuan dan asisten", () => {
    const help = JSON.stringify(HELP_ROLE_CONTENT.OWNER);
    const workflow = JSON.stringify(FAQ_WORKFLOWS.find(item => item.faqNumber === 20));
    for (const text of [help, workflow]) {
      expect(text).toContain("Tambah kategori");
      expect(text).toContain("Simpan kategori");
      expect(text).toContain("Filter kategori");
    }
  });
  it("mencatat fitur kategori dengan tiga langkah", () => {
    const change = CHANGELOG.find(item => item.id === "finance-custom-expense-categories");
    expect(change).toMatchObject({ date: "2026-11-01", revision: 1, href: "/keuangan" });
    expect(change?.steps).toHaveLength(3);
  });
});
