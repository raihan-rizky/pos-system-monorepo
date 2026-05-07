import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('should login successfully as owner', async ({ page }) => {
    await page.goto('/login');
    
    await page.fill('#login-username', 'owner');
    await page.fill('#login-password', 'owner123');
    await page.click('#login-submit');

    // After login, it should redirect to /pos or /dashboard
    await page.waitForURL(/.*(pos|dashboard)/, { timeout: 60000 });
    
    // Wait for the logout button in sidebar as indicator of successful login
    await expect(page.locator('#sidebar-logout')).toBeVisible({ timeout: 20000 });
    await expect(page.url()).toMatch(/.*(pos|dashboard)/);
  });

  test('should show error with invalid credentials', async ({ page }) => {
    await page.goto('/login');
    
    await page.fill('#login-username', 'invalid');
    await page.fill('#login-password', 'wrongpassword');
    await page.click('#login-submit');
    await expect(page).not.toHaveURL(/.*(pos|dashboard)/);

    // Wait for error message (red box)
    const errorMsg = page.locator('div.bg-red-500\\/10');
    await expect(errorMsg).toBeVisible();
    
    // Also check if it contains some common error text
    await expect(errorMsg).not.toBeEmpty();
  });
});
