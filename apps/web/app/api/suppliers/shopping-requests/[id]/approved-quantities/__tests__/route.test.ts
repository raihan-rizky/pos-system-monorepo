import { existsSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const saveApprovedQuantitiesMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: () => null,
}));

vi.mock(
  "@/features/suppliers/shopping-requests/services/shopping-requests-service",
  () => ({
    saveShoppingRequestApprovedQuantities: saveApprovedQuantitiesMock,
    ShoppingRequestNotFoundError: class ShoppingRequestNotFoundError extends Error {},
    ShoppingRequestValidationError: class ShoppingRequestValidationError extends Error {},
  }),
);

describe("PATCH approved quantities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockResolvedValue({
      id: "owner-1",
      name: "Owner",
      storeId: "store-main",
    });
    saveApprovedQuantitiesMock.mockResolvedValue({ id: "request-1" });
  });

  it("uses the dedicated RBAC permission and never approves stock", async () => {
    const routePath = join(
      process.cwd(),
      "app/api/suppliers/shopping-requests/[id]/approved-quantities/route.ts",
    );
    expect(existsSync(routePath)).toBe(true);
    if (!existsSync(routePath)) return;
    const { PATCH } = await import("../route");
    const response = await PATCH(
      new Request("http://localhost/api/suppliers/shopping-requests/request-1/approved-quantities", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmOverRequested: true,
          items: [{ id: "item-1", approvedQty: 7 }],
        }),
      }),
      { params: Promise.resolve({ id: "request-1" }) },
    );

    expect(response.status).toBe(200);
    expect(requirePermissionMock).toHaveBeenCalledWith(
      "supplier.shopping_request.set_approved_qty",
      "update",
    );
    expect(saveApprovedQuantitiesMock).toHaveBeenCalledWith(
      "request-1",
      {
        confirmOverRequested: true,
        items: [{ id: "item-1", approvedQty: 7 }],
      },
      expect.objectContaining({ id: "owner-1" }),
    );
  });
});
