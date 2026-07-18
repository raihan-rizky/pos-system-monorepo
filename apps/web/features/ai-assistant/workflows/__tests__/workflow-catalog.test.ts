import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { FAQ_WORKFLOWS } from "../workflow-catalog";

describe("FAQ workflow catalog", () => {
  it("defines one serializable guided workflow for each numbered FAQ", () => {
    expect(FAQ_WORKFLOWS).toHaveLength(36);
    expect(FAQ_WORKFLOWS.map((workflow) => workflow.faqNumber).sort((a, b) => a - b))
      .toEqual(Array.from({ length: 36 }, (_, index) => index + 1));

    for (const workflow of FAQ_WORKFLOWS) {
      expect(workflow.id).toMatch(/^faq-q\d{2}-[a-z0-9-]+$/);
      expect(workflow.title).toMatch(/[A-Za-zÀ-ž]/);
      expect(workflow.aliases.length).toBeGreaterThanOrEqual(2);
      expect(workflow.requiredPages.length + workflow.requiredCapabilities.length)
        .toBeGreaterThan(0);
      expect(workflow.route).toMatch(/^\//);
      expect(workflow.actionLabel).toMatch(/^Buka /);
      expect(workflow.sourceRef).toMatch(/^docs\/help\/faq\.md#q\d+/);
      expect(workflow.iconKey).toMatch(/^[a-z-]+$/);
      expect(workflow.steps.length).toBeGreaterThanOrEqual(2);

      for (const step of workflow.steps) {
        expect(step.id).toMatch(new RegExp(`^${workflow.id}-step-\\d+$`));
        expect(step.title).not.toContain("TODO");
        expect(step.description).not.toContain("TODO");
        expect(step.route).toBe(workflow.route);
        expect(step.actionLabel).toBe(workflow.actionLabel);
        expect(step.iconKey).toBe(workflow.iconKey);
      }

      expect(() => JSON.stringify(workflow)).not.toThrow();
    }
  });

  it("keeps inbound receipt guidance aligned with submit, revision, and granular decision RBAC", () => {
    const inbound = FAQ_WORKFLOWS.find((workflow) => workflow.faqNumber === 18);

    expect(inbound).toBeDefined();
    const serializedInbound = JSON.stringify(inbound);
    expect(serializedInbound).toContain("Ajukan ke Owner");
    expect(serializedInbound).toContain("Sudah dibuat");
    expect(serializedInbound).toContain("Perlu Revisi");
    expect(serializedInbound).toContain("inventory.inbound_receipt.approve");
    expect(serializedInbound).toContain("inventory.inbound_receipt.reject");
    expect(serializedInbound).toContain("inventory.inbound_receipt.revise");
    expect(JSON.stringify(inbound)).not.toContain("admin dengan izin `inventory.approve`");
  });

  it("documents the custom invoice date guide in the workflow catalog and FAQ source", () => {
    const customInvoiceDateWorkflow = FAQ_WORKFLOWS.find((workflow) => workflow.faqNumber === 10);
    const faqSource = readFileSync(new URL("../../docs/help/faq.md", import.meta.url), "utf8");

    expect(customInvoiceDateWorkflow).toMatchObject({
      id: "faq-q10-custom-invoice-date",
      route: "/history",
      actionLabel: "Buka Riwayat",
      sourceRef: "docs/help/faq.md#q10-bagaimana-cara-mengubah-tanggal-invoice-transaksi",
      allowedRoles: ["OWNER", "ADMIN"],
    });
    expect(JSON.stringify(customInvoiceDateWorkflow)).toContain("Tanggal Invoice");
    expect(JSON.stringify(customInvoiceDateWorkflow)).toContain("alasan perubahan");
    expect(JSON.stringify(customInvoiceDateWorkflow)).toContain("cetak ulang");
    expect(faqSource).toContain("### Q10: Bagaimana cara mengubah tanggal invoice transaksi?");
    expect(faqSource).toContain("**Ubah Tanggal Invoice**");
    expect(faqSource).toContain("cetak ulang invoice final");
  });

  it("keeps inventory daily workflow aligned with Log OUT verification RBAC and correction flow", () => {
    const inventoryWorkflow = FAQ_WORKFLOWS.find((workflow) => workflow.faqNumber === 31);

    expect(inventoryWorkflow).toBeDefined();
    const serializedWorkflow = JSON.stringify(inventoryWorkflow);
    expect(serializedWorkflow).toContain("Log OUT Belum Diverifikasi");
    expect(serializedWorkflow).toContain("Setujui");
    expect(serializedWorkflow).toContain("Perlu Koreksi");
    expect(serializedWorkflow).toContain("tombol Koreksi");
    expect(serializedWorkflow).toContain("inventory.out_log.verify");
  });

  it("documents product-first Update Stok single and bulk paths with duplicate safeguards", () => {
    const massStockWorkflow = FAQ_WORKFLOWS.find((workflow) => workflow.faqNumber === 35);

    expect(massStockWorkflow).toBeDefined();
    const serializedWorkflow = JSON.stringify(massStockWorkflow);
    expect(serializedWorkflow).toContain("Update Stok");
    expect(serializedWorkflow).toContain("Satu Produk (Single)");
    expect(serializedWorkflow).toContain("Banyak Produk (Bulk)");
    expect(serializedWorkflow).toContain("Update Stok Massal");
    expect(serializedWorkflow).not.toContain("Buka Update Stok Massal");
    expect(serializedWorkflow).not.toContain("buka tab Transaksi");
    expect(serializedWorkflow).toContain("Stok Bersama");
    expect(serializedWorkflow).toContain("Stok Produk Ini");
    expect(serializedWorkflow).toContain("Thumbnail/foto produk");
    expect(serializedWorkflow).toContain("foto produk/varian");
    expect(serializedWorkflow).toContain("Pilih satu produk saja per grup stok");
    expect(serializedWorkflow).toContain("approval");
  });

  it("documents customer recap export by type and AI summary", () => {
    const customerExportWorkflow = FAQ_WORKFLOWS.find((workflow) => workflow.faqNumber === 36);

    expect(customerExportWorkflow).toMatchObject({
      id: "faq-q36-export-customer-recap",
      route: "/customers",
      actionLabel: "Buka Pelanggan",
    });
    const serializedWorkflow = JSON.stringify(customerExportWorkflow);
    expect(serializedWorkflow).toContain("Agen");
    expect(serializedWorkflow).toContain("Pemerintah");
    expect(serializedWorkflow).toContain("Top 10 Produk");
    expect(serializedWorkflow).toContain("Analisis AI");
  });

  it("documents proof compression and delegated deletion", () => {
    const proof = FAQ_WORKFLOWS.find((workflow) => workflow.faqNumber === 11);
    const serialized = JSON.stringify(proof);
    expect(serialized).toContain("dikompresi");
    expect(serialized).toContain("Hapus foto");
    expect(serialized).toContain("proof_upload:delete");
  });

  it("keeps proof guidance R2-first with prnt.sc limited to upload failure fallback", () => {
    const uploadWorkflow = FAQ_WORKFLOWS.find((workflow) => workflow.faqNumber === 11);
    const expenseWorkflow = FAQ_WORKFLOWS.find((workflow) => workflow.faqNumber === 20);
    const faqSource = readFileSync(new URL("../../docs/help/faq.md", import.meta.url), "utf8");

    for (const workflow of [uploadWorkflow, expenseWorkflow]) {
      const serialized = JSON.stringify(workflow);
      expect(serialized).toContain("Pilih gambar bukti");
      expect(serialized).toContain("R2");
      expect(serialized).toContain("prnt.sc");
      expect(serialized).toContain("gagal");
    }
    expect(faqSource).toContain("penyimpanan R2 gagal");
  });
});
