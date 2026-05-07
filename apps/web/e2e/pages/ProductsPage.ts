import { Page, Locator, expect } from '@playwright/test';

export class ProductsPage {
  readonly page: Page;
  readonly addButton: Locator;
  readonly searchInput: Locator;

  constructor(page: Page) {
    this.page = page;
    this.addButton = page.getByRole('button', { name: 'Add New Product' });
    this.searchInput = page.getByPlaceholder('Search by name, SKU, or barcode...');
  }

  async goto() {
    await this.page.goto('/products', { waitUntil: 'load' });
  }

  async openAddModal() {
    await this.addButton.click();
    await expect(this.page.getByRole('heading', { name: 'Add New Product' })).toBeVisible();
  }

  async fillProductForm(data: { name: string, sku: string, price: string, category: string }) {
    await this.page.getByLabel('Product Name').fill(data.name);
    await this.page.getByLabel('SKU / Item Code').fill(data.sku);
    // Select category by label
    await this.page.getByLabel('Category').selectOption({ label: data.category });
    await this.page.getByLabel('Selling Price (IDR)').fill(data.price);
    await this.page.getByLabel('Current Stock').fill('10');
  }

  async saveProduct() {
    await this.page.click('button:has-text("Save Product")');
  }

  async searchProduct(name: string) {
    await this.searchInput.fill(name);
    // Wait for the list to filter (using a small delay or checking for the result)
    await this.page.waitForTimeout(500); 
  }
}
