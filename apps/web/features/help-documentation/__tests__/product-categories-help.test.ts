import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { HELP_ROLE_CONTENT } from "../components/HelpContent";
import { FAQ_WORKFLOWS } from "@/features/ai-assistant/workflows/workflow-catalog";
import { matchAssistantWorkflow } from "@/features/ai-assistant/workflows/assistant-workflow-matcher";
import { buildDefaultRolePermissions } from "@/features/rbac/helpers/rbac-core";

const requiredGuidance = [
  "tab Kategori", "Tambah kategori", "Ubah kategori", "beberapa baris",
  "Pindahkan Kategori", "kategori asal", "kategori tujuan", "nonaktif", "seluruh toko",
  "aturan harga", "ikut dihapus", "HAPUS N KATEGORI", "Saya memahami",
  "harga pelanggan", "Owner", "product.update", "product.delete",
];

describe("category management help and workflow guidance", () => {
  it.each(["OWNER", "ADMIN"])("explains per-unit classification and preserves legacy categories for %s", role => {
    const guide = HELP_ROLE_CONTENT[role].find(entry => entry.id === (role === "OWNER" ? "owner-categories" : "admin-categories"));
    const text = JSON.stringify(guide!.steps);
    for (const phrase of [
      "Penataan kategori", "Kategori lama", "Belum diatur", "satuan yang dipilih",
      "tertutup dan tidak aktif", "ATK", "PERCETAKAN", "PRINT", "STEMPEL", "PLAT",
      "Tinjau pemindahan", "Dampak harga pelanggan", "Pindahkan satuan", "stok bersama",
    ]) expect(text.toLowerCase()).toContain(phrase.toLowerCase());
    expect(text).toContain("kategori lama tetap tersimpan");
  });

  it("guides an editor through classification without claiming the old category is replaced", () => {
    const guide = FAQ_WORKFLOWS.find(workflow => workflow.faqNumber === 55)!;
    const text = JSON.stringify(guide.steps);
    for (const phrase of ["Penataan kategori", "Kategori lama", "Belum diatur", "satuan yang dipilih", "Tinjau pemindahan", "Pindahkan satuan", "Dampak harga pelanggan"]) {
      expect(text.toLowerCase()).toContain(phrase.toLowerCase());
    }
    expect(text).toContain("kategori lama tetap tersimpan");
    expect(text).not.toContain("HAPUS N KATEGORI");
  });

  it("explains that new-product classification is optional and applies to all new units", () => {
    const guide = FAQ_WORKFLOWS.find(workflow => workflow.faqNumber === 1)!;
    const text = JSON.stringify(guide.steps).toLowerCase();
    expect(text).toContain("kategori utama");
    expect(text).toContain("subkategori");
    expect(text).toContain("semua satuan produk baru");
    expect(text).toContain("diatur nanti");
    expect(text).toContain("kategori lama wajib");
    expect(text).toContain("pilih kategori utama lalu subkategori");
  });

  it("finds classification guidance for a product editor", () => {
    const result = matchAssistantWorkflow({ message: "atur subkategori produk", role: "ADMIN", permissions: buildDefaultRolePermissions() });
    expect(result).toMatchObject({ kind: "matched", workflow: { faqNumber: 55 } });
  });

  it("keeps the assistant FAQ source aligned with the per-unit guidance", () => {
    const faq = readFileSync(new URL("../../ai-assistant/docs/help/faq.md", import.meta.url), "utf8");
    for (const phrase of ["Penataan kategori", "kategori lama tetap tersimpan", "Tinjau pemindahan", "Pindahkan satuan"]) {
      expect(faq).toContain(phrase);
    }
  });

  it.each(["OWNER", "ADMIN"])("explains the complete category workflow for %s", role => {
    const guide = HELP_ROLE_CONTENT[role].find(entry => entry.id === (role === "OWNER" ? "owner-categories" : "admin-categories"));
    expect(guide).toBeDefined();
    const text = JSON.stringify(guide!.steps);
    for (const phrase of requiredGuidance) expect(text.toLowerCase()).toContain(phrase.toLowerCase());
    expect(text).toContain("muat ulang");
    expect(text).toContain("tidak dapat dipulihkan");
  });

  it("keeps FAQ numbering stable while making category instructions discoverable", () => {
    expect(FAQ_WORKFLOWS.length).toBeGreaterThanOrEqual(38);
    expect(FAQ_WORKFLOWS.slice(0, 38).map(workflow => workflow.faqNumber)).toEqual(Array.from({ length: 38 }, (_, i) => i + 1));
    expect(new Set(FAQ_WORKFLOWS.map(workflow => workflow.faqNumber)).size).toBe(FAQ_WORKFLOWS.length);
    const product = FAQ_WORKFLOWS.find(workflow => workflow.faqNumber === 1)!;
    expect(product.aliases).toContain("tambah kategori");
    const edit = FAQ_WORKFLOWS.find(workflow => workflow.faqNumber === 2)!;
    expect(edit.aliases).toEqual(expect.arrayContaining(["ubah kategori", "hapus kategori", "pindahkan kategori"]));
    const text = JSON.stringify([...product.steps, ...edit.steps]);
    for (const phrase of requiredGuidance) expect(text).toContain(phrase);
    expect(text).toContain("tidak dapat dipulihkan");
    expect(text).toContain("muat ulang");
  });

  it.each(["ubah kategori", "pindahkan kategori"])("provides %s guidance to an editor without create permission", message => {
    const permissions = buildDefaultRolePermissions();
    permissions.ADMIN.resources.product.create = false;
    permissions.ADMIN.resources.product.update = true;
    const result = matchAssistantWorkflow({ message, role: "ADMIN", permissions });
    expect(result).toMatchObject({ kind: "matched", workflow: { faqNumber: 2 } });
  });
});
