import { describe, expect, it } from "vitest";

import { FAQ_WORKFLOWS } from "../workflow-catalog";

describe("FAQ workflow catalog", () => {
  it("defines one serializable guided workflow for each numbered FAQ", () => {
    expect(FAQ_WORKFLOWS).toHaveLength(35);
    expect(FAQ_WORKFLOWS.map((workflow) => workflow.faqNumber).sort((a, b) => a - b))
      .toEqual(Array.from({ length: 35 }, (_, index) => index + 1));

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
});
