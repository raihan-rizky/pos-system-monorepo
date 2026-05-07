import { test, expect } from '@playwright/test';
import { ProductsPage } from './pages/ProductsPage';

test.describe.serial('Product Management', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/login');
    await page.fill('#login-username', 'owner');
    await page.fill('#login-password', 'owner123');
    await page.click('#login-submit');
    await page.waitForURL(/.*(pos|dashboard)/, { timeout: 60000 });
    
    // Wait for the main layout (logout button is a good indicator)
    await expect(page.locator('#sidebar-logout')).toBeVisible({ timeout: 20000 });

    // Handle shift modal if it appears (it can block navigation/clicks)
    const shiftModalClose = page.getByRole('button', { name: 'Tutup' });
    if (await shiftModalClose.isVisible()) {
      await shiftModalClose.click();
    }
  });

  test('should create a new product and see it in the list', async ({ page }) => {
    const productsPage = new ProductsPage(page);
    await productsPage.goto();
    
    const productName = `Test Product ${Date.now()}`;
    const sku = `SKU-${Date.now()}`;

    await productsPage.openAddModal();
    await productsPage.fillProductForm({
      name: productName,
      sku: sku,
      price: '25000',
      category: 'Alat Tulis'
    });
    await productsPage.saveProduct();

    // Verify it appears in the list (might need a search)
    await productsPage.searchProduct(productName);
    await expect(page.getByText(productName)).toBeVisible();
  });

  test('should open edit modal with correct values', async ({ page }) => {
    const productsPage = new ProductsPage(page);
    await productsPage.goto();

    // Use an existing product from seed
    const productName = 'Pulpen Pilot G2';
    await productsPage.searchProduct(productName);
    
    // Find the product card specifically in the product list
    const productCard = page.locator('p', { hasText: productName }).locator('xpath=ancestor::div[contains(@class, "group")]').first();
    await productCard.hover();
    
    // Click the Edit button which has the title "Edit Product"
    await productCard.getByTitle('Edit Product').click();

    // Verify modal is open and has correct title
    await expect(page.getByRole('heading', { name: 'Edit Product' })).toBeVisible();

    // Verify fields are populated
    await expect(page.locator('#product-name')).toHaveValue(productName);
    await expect(page.locator('#sku-/-item-code')).toHaveValue('ATU-001');
  });
});
