import { describe, expect, it } from "vitest";
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
  it.each(["OWNER", "ADMIN"])("explains the complete category workflow for %s", role => {
    const guide = HELP_ROLE_CONTENT[role].find(entry => entry.id === (role === "OWNER" ? "owner-categories" : "admin-categories"));
    expect(guide).toBeDefined();
    const text = JSON.stringify(guide!.steps);
    for (const phrase of requiredGuidance) expect(text.toLowerCase()).toContain(phrase.toLowerCase());
    expect(text).toContain("muat ulang");
    expect(text).toContain("tidak dapat dipulihkan");
  });

  it("keeps FAQ numbering stable while making category instructions discoverable", () => {
    expect(FAQ_WORKFLOWS).toHaveLength(38);
    expect(FAQ_WORKFLOWS.map(workflow => workflow.faqNumber)).toEqual(Array.from({ length: 38 }, (_, i) => i + 1));
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
