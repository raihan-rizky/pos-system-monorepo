import { type Locator, type Page, expect } from "@playwright/test";

export class StockApprovalPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async gotoProducts() {
    await this.page.goto("/products");
    await expect(this.page.getByRole("heading", { name: "Products Hub" })).toBeVisible();
  }

  async openStockUpdateForFirstProduct() {
    const firstButton = this.page.getByTitle("Update Stock").first();
    await firstButton.scrollIntoViewIfNeeded();
    await firstButton.click();
  }

  async submitStockChange(opts: {
    type: "IN" | "OUT" | "ADJUSTMENT";
    quantity: string;
    note?: string;
  }) {
    const modal = this.page.getByRole("dialog");
    if (opts.type === "IN") await modal.getByRole("button", { name: "Stock In" }).click();
    if (opts.type === "OUT") await modal.getByRole("button", { name: "Stock Out" }).click();
    if (opts.type === "ADJUSTMENT") await modal.getByRole("button", { name: "Set Exact" }).click();

    const quantityField = modal.getByLabel(/Quantity to|New Stock Level/);
    await quantityField.fill(opts.quantity);
    if (opts.note) {
      await modal.getByLabel("Note (Optional)").fill(opts.note);
    }
    await modal
      .getByRole("button", { name: /Confirm Update|Submit Request/ })
      .click();
  }

  modalTitleForRequester(): Locator {
    return this.page.getByRole("heading", { name: "Ajukan Perubahan Stok" });
  }

  modalTitleForOwner(): Locator {
    return this.page.getByRole("heading", { name: "Update Inventory" });
  }

  pendingNoticeStrip(): Locator {
    return this.page.getByText(/Perubahan stok akan dieksekusi setelah owner menyetujui/);
  }

  pendingSuccessBanner(): Locator {
    return this.page.getByText("Permintaan dikirim");
  }

  async openStockLogsTab() {
    await this.page.getByRole("button", { name: /Stock Logs/ }).click();
  }

  pendingChipBadge(): Locator {
    return this.page.locator('[aria-label*="permintaan menunggu persetujuan"]').first();
  }

  statusChip(label: "Semua" | "Pending" | "Disetujui" | "Ditolak"): Locator {
    return this.page.getByRole("tab", { name: new RegExp(`^${label}`) });
  }

  rowByProductName(name: string): Locator {
    return this.page.locator("tr", { hasText: name });
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
    return this.page.getByRole("button", { name: /Tolak Permintaan/ });
  }

  rejectComposerReason(): Locator {
    return this.page.getByPlaceholder(/Misal: stok tidak mencukupi/);
  }

  async cancelRow(name: string) {
    const row = this.rowByProductName(name);
    await row.getByRole("button", { name: "Batalkan" }).click();
  }

  conflictToast(): Locator {
    return this.page.getByText(/Permintaan sudah diputuskan oleh user lain/);
  }

  sidebarProductsBadge(): Locator {
    return this.page
      .locator('a[href="/products"] [aria-label*="permintaan menunggu persetujuan"]')
      .first();
  }
}
