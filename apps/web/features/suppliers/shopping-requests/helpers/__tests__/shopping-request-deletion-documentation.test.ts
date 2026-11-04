import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FAQ_WORKFLOWS } from "@/features/ai-assistant/workflows/workflow-catalog";
import { CHANGELOG } from "@/features/changelog/data/changelog";

describe("panduan penghapusan daftar belanja", () => {
  it("menjelaskan izin, pembalikan stok, dan riwayat dalam Bantuan dan FAQ", () => {
    const help = readFileSync("features/help-documentation/components/HelpContent.tsx", "utf8");
    const faq = readFileSync("features/ai-assistant/docs/help/faq.md", "utf8");
    for (const text of [help, faq]) {
      expect(text).toContain("supplier.shopping_request.delete");
      expect(text).toContain("Hapus daftar");
      expect(text).toContain("Dibatalkan");
      expect(text).toContain("HPP");
    }
  });

  it("mencantumkan alur pada katalog asisten dan catatan perubahan", () => {
    const workflow = FAQ_WORKFLOWS.find((entry) => entry.faqNumber === 19);
    expect(JSON.stringify(workflow)).toContain("supplier.shopping_request.delete");
    expect(JSON.stringify(workflow)).toContain("Hapus daftar");
    const change = CHANGELOG.find((entry) => entry.id === "shopping-request-deletion");
    expect(change).toMatchObject({ date: "2026-11-04", href: "/suppliers?tab=shopping-requests" });
    expect(change?.steps).toHaveLength(3);
  });
});
