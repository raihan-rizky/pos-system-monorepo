import { type Locator, type Page, expect } from "@playwright/test";

export class StockApprovalPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async gotoInventory() {
    await this.page.goto("/inventory");
    await expect(
      this.page.getByRole("heading", { name: "Inventaris", exact: true }),
    ).toBeVisible();
  }

  async openStockUpdateForFirstProduct() {
    await this.page
      .getByRole("button", { name: "Update Stok", exact: true })
      .click();
    await this.page.getByRole("menuitem", { name: /Satu Produk/ }).click();
    const modal = this.page.getByRole("dialog", { name: "Update Stok" });
    await modal.getByPlaceholder(/Cari nama produk/).fill("Kertas HVS A4");
    await modal.getByRole("button", { name: /Kertas HVS A4/ }).click();
  }

  async submitStockChange(opts: {
    type: "IN" | "OUT" | "ADJUSTMENT";
    quantity: string;
    note?: string;
  }) {
    const modal = this.page.getByRole("dialog", { name: "Update Stok" });
    const action = {
      IN: "Tambah stok",
      OUT: "Kurangi stok",
      ADJUSTMENT: "Set stok akhir",
    }[opts.type];
    await modal.getByLabel("Aksi").selectOption({ label: action });

    const quantityField = modal.getByLabel(/Jumlah|Stok akhir baru/);
    await quantityField.fill(opts.quantity);
    if (opts.note) {
      await modal.getByPlaceholder("Catatan approval").fill(opts.note);
    }
    await expect(modal.getByRole("button", { name: "Ajukan Update Stok" })).toBeEnabled();
    await modal.getByRole("button", { name: "Ajukan Update Stok" }).click();
  }

  modalTitleForRequester(): Locator {
    return this.page.getByRole("heading", { name: "Update Stok", exact: true });
  }

  modalTitleForOwner(): Locator {
    return this.page.getByRole("heading", { name: "Update Stok", exact: true });
  }

  pendingNoticeStrip(): Locator {
    return this.page.getByText(/ajukan approval owner/i);
  }

  pendingSuccessBanner(): Locator {
    return this.page.getByRole("alert").filter({
      hasText: "Permintaan update stok berhasil dibuat dan menunggu approval owner.",
    });
  }

  async openStockLogsTab() {
    const logsPanel = this.page.getByRole("tablist", { name: "Filter status" });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await this.page.getByRole("tab", { name: "Riwayat" }).click();
      await this.page.getByRole("button", { name: "Log Stok" }).click();
      const opened = await logsPanel
        .waitFor({ state: "visible", timeout: 1500 })
        .then(() => true)
        .catch(() => false);
      if (opened) return;
    }
    await expect(logsPanel).toBeVisible();
  }

  pendingChipBadge(): Locator {
    return this.page.locator('[aria-label*="permintaan menunggu persetujuan"]').first();
  }

  statusChip(label: "Semua" | "Pending" | "Disetujui" | "Ditolak"): Locator {
    return this.page.getByRole("tab", { name: new RegExp(`^${label}`) });
  }

  rowByProductName(name: string): Locator {
    return this.page.getByRole("table").locator("tr", { hasText: name });
  }

  async approveRow(name: string) {
    const row = this.rowByProductName(name);
    await row.getByRole("button", { name: "Setuju" }).click();
  }

  async startRejectRow(name: string) {
    const row = this.rowByProductName(name);
    await row.getByRole("button", { name: "Tolak" }).click();
  }

  rejectComposerSubmit(): Locator {
    return this.page.getByRole("table").getByRole("button", { name: /Tolak Permintaan/ });
  }

  rejectComposerReason(): Locator {
    return this.page.getByRole("table").getByPlaceholder(/Misal: stok tidak mencukupi/);
  }

  async cancelRow(name: string) {
    const row = this.rowByProductName(name);
    await row.getByRole("button", { name: "Batalkan" }).click();
  }

  conflictToast(): Locator {
    return this.page.getByText(/Permintaan sudah diputuskan oleh user lain/);
  }

  sidebarInventoryBadge(): Locator {
    return this.page
      .locator('a[href="/inventory"] [aria-label*="permintaan menunggu persetujuan"]')
      .first();
  }
}
