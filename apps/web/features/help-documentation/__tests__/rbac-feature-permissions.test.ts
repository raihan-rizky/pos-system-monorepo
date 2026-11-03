import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { HELP_ROLE_CONTENT } from "../components/HelpContent";
import { FAQ_WORKFLOWS } from "@/features/ai-assistant/workflows/workflow-catalog";
import { CHANGELOG } from "@/features/changelog/data/changelog";

const featureLabels = [
  "Harga khusus di nota", "Pemasukan manual", "Pengeluaran dan transfer manual",
  "Pembayaran utang supplier", "Pencairan giro", "Ekspor laporan keuangan",
  "Impor produk", "Perubahan stok massal",
];

describe("RBAC feature permission guidance", () => {
  const ownerGuide = HELP_ROLE_CONTENT.OWNER.find(item => item.id === "owner-rbac")!;
  const workflow = FAQ_WORKFLOWS.find(item => item.id === "faq-q23-manage-rbac")!;

  it.each([
    ["Bantuan", JSON.stringify(ownerGuide)],
    ["manage-rbac", JSON.stringify(workflow)],
  ])("makes feature controls and read-only monitoring discoverable in %s", (_name, text) => {
    for (const label of featureLabels) expect(text.toLowerCase()).toContain(label.toLowerCase());
    expect(text).toMatch(/master/i);
    expect(text).toMatch(/progres/i);
    expect(text).toMatch(/batal/i);
    expect(text).toMatch(/ulang/i);
    expect(text).toMatch(/terpisah/i);
  });

  it("provides exact capabilities and transition rules to assistant help retrieval", () => {
    const help = readFileSync("features/ai-assistant/docs/help/settings-rbac.md", "utf8");
    for (const resource of ["transaction.custom_price", "income.manual", "expense.manual_transfer", "expense.payable", "expense.giro", "financial-report.export", "product.import", "inventory.bulk"]) {
      expect(help).toContain(`\`${resource}\``);
    }
    expect(help).toMatch(/penolakan eksplisit/i);
    expect(help).toMatch(/simpan pertama/i);
    expect(help).toMatch(/43 resource/i);
    expect(help).toMatch(/25 modul/i);
  });

  it("announces the feature permissions in the existing release with compact usage steps", () => {
    const entry = CHANGELOG.find(item => item.id === "rbac-effective-access")!;
    expect(entry).toMatchObject({ date: "2026-11-04", revision: 1, href: "/settings", visual: "rbac" });
    expect(entry.steps).toHaveLength(3);
    expect(entry.highlight!.title.length).toBeLessThanOrEqual(40);
    expect(entry.highlight!.summary.length).toBeLessThanOrEqual(85);
    const text = JSON.stringify(entry).toLowerCase();
    for (const feature of ["nota", "keuangan", "impor", "stok massal"]) expect(text).toContain(feature);
  });
});
