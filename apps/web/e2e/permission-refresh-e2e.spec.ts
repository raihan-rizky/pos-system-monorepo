import { expect, test, authenticate, mockApis } from "./fixtures/app";
import { buildDefaultRolePermissions } from "../features/rbac/helpers/rbac-core";
import { buildAuthorizationFingerprint } from "../features/rbac/helpers/authorization-fingerprint";

for (const role of ["OWNER", "SALES"] as const) {
  test(`fixture mempertahankan akses ${role} saat izin diperbarui`, async ({ page }) => {
    const userId = `e2e-${role.toLowerCase()}`;
    await authenticate(page, role, userId);
    await mockApis(page);

    const initialAccess = page.waitForResponse(response => response.url().includes("/api/auth/permissions"));
    await page.goto("/help");
    const response = await initialAccess;
    const permissions = buildDefaultRolePermissions();

    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({
      user: { id: userId, role, storeId: "store-main" },
      permissions,
      authorizationFingerprint: buildAuthorizationFingerprint(role, permissions),
    });
    await expect(page.getByRole("heading", { name: "Dokumentasi Bantuan" })).toBeVisible();

    const refreshedAccess = page.waitForResponse(result => result.url().includes("/api/auth/permissions"));
    await page.evaluate(() => window.dispatchEvent(new Event("pos:permissions-changed")));
    expect((await refreshedAccess).status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Dokumentasi Bantuan" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Hak akses belum dapat diperiksa" })).toHaveCount(0);
  });
}
