import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FAQ_WORKFLOWS } from "@/features/ai-assistant/workflows/workflow-catalog";
import { getMissingWorkflowRequirements } from "@/features/ai-assistant/workflows/assistant-workflow-matcher";
import { buildDefaultRolePermissions } from "@/features/rbac/helpers/rbac-core";
import { CHANGELOG } from "@/features/changelog/data/changelog";

const help = readFileSync(new URL("../components/HelpContent.tsx", import.meta.url), "utf8");
const faq = readFileSync(new URL("../../ai-assistant/docs/help/faq.md", import.meta.url), "utf8");

describe("panduan koreksi nota Percetakan yang diproses", () => {
  it("explains explicit review, permission, and the financial consequences in help and FAQ", () => {
    const printingGuide = help.slice(help.indexOf("const PRINTING_RECEIPT_GUIDE"), help.indexOf("export const HELP_ROLE_CONTENT"));
    for (const text of [printingGuide, faq]) {
      for (const term of ["Edit nota diproses", "Saya memahami dampaknya terhadap transaksi, stok, dan piutang.", "Tetap edit nota", "Tinjau perubahan", "Simpan dan perbarui transaksi", "printing_receipt.processed", "Owner", "piutang", "sebelum", "sesudah", "tidak tersimpan otomatis"]) {
        expect(text, term).toContain(term);
      }
      expect(text).not.toContain("Setelah diproses, isi nota tetap");
    }
    expect(faq).not.toContain("mempertahankan tanggal, nomor, dan isi nota");
    expect(faq).toContain("### Q42: Bagaimana cara mengedit nota Percetakan yang sudah diproses?");
  });

  it("requires the dedicated correction permission without restricting the creation workflow", () => {
    const edit = FAQ_WORKFLOWS.find(item => item.faqNumber === 42);
    expect(edit).toMatchObject({ route: "/pos", requiredCapabilities: [{ resource: "printing_receipt.processed", action: "update" }] });
    expect(edit?.allowedRoles).toBeUndefined();
    const permissions = buildDefaultRolePermissions();
    expect(getMissingWorkflowRequirements(edit!, "OWNER", permissions)).toEqual([]);
    expect(getMissingWorkflowRequirements(edit!, "ADMIN", permissions)).toContain("resource:printing_receipt.processed.update");
    permissions.ADMIN.resources["printing_receipt.processed"].update = true;
    expect(getMissingWorkflowRequirements(edit!, "ADMIN", permissions)).toEqual([]);
    expect(FAQ_WORKFLOWS.find(item => item.faqNumber === 40)?.requiredCapabilities).not.toEqual(expect.arrayContaining([{ resource: "printing_receipt.processed", action: "update" }]));
    const text = JSON.stringify(edit?.steps);
    for (const term of ["Edit nota diproses", "Saya memahami dampaknya terhadap transaksi, stok, dan piutang.", "Tetap edit nota", "tidak tersimpan otomatis", "Tinjau perubahan", "Simpan dan perbarui transaksi", "lunas", "piutang", "pembayaran bersih", "dibatalkan", "refund", "menunggu persetujuan", "nomor nota", "pelanggan terdaftar", "Riwayat pembayaran"]) expect(text, term).toContain(term);
  });

  it("publishes a three-step release note with compact highlights and the actual warning screenshot", () => {
    const entry = CHANGELOG.find(item => item.id === "processed-printing-receipt-edit");
    expect(entry).toMatchObject({ date: "2026-10-21", revision: 1, href: "/pos", visual: "printing", screenshot: { src: "/images/changelog/edit-nota-diproses.png" } });
    expect(entry?.steps).toHaveLength(3);
    expect(entry!.highlight.title.length).toBeLessThanOrEqual(40);
    expect(entry!.highlight.summary.length).toBeLessThanOrEqual(85);
    expect(entry!.screenshot?.alt).toContain("data contoh");
    const steps = JSON.stringify(entry?.steps);
    for (const term of ["Edit nota diproses", "Saya memahami dampaknya terhadap transaksi, stok, dan piutang.", "Tetap edit nota", "Tinjau perubahan", "Simpan dan perbarui transaksi"]) expect(steps).toContain(term);
  });
});
