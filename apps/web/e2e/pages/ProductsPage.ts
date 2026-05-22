import { Page, Locator, expect } from '@playwright/test';

export class ProductsPage {
  readonly page: Page;
  readonly addButton: Locator;
  readonly searchInput: Locator;

  constructor(page: Page) {
    this.page = page;
    this.addButton = page.getByRole('button', { name: 'Tambah Produk' });
    this.searchInput = page.getByPlaceholder('Cari nama, SKU, atau barcode');
  }

  async goto() {
    await this.page.goto('/products', { waitUntil: 'load' });
  }

  async openAddModal() {
    await this.addButton.click();
    await expect(this.page.getByRole('heading', { name: 'Tambah Produk' })).toBeVisible();
  }

  async fillProductForm(data: { name: string, sku: string, price: string, category: string }) {
    await this.page.getByLabel('Nama Produk').fill(data.name);
    await this.page.getByLabel('SKU / Kode Barang').fill(data.sku);
    // Select category by label
    await this.page.getByLabel('Kategori').selectOption({ label: data.category });
    await this.page.getByLabel('Harga Jual').fill(data.price);
    await this.page.getByLabel('Stok Saat Ini').fill('10');
  }

  async saveProduct() {
    await this.page.click('button:has-text("Simpan Produk")');
  }

  async searchProduct(name: string) {
    await this.searchInput.fill(name);
    // Wait for the list to filter (using a small delay or checking for the result)
    await this.page.waitForTimeout(500); 
  }
}
