import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const updateShoppingRequestMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: () => null,
}));

vi.mock(
  "@/features/suppliers/shopping-requests/services/shopping-requests-service",
  () => ({
    cancelShoppingRequest: vi.fn(),
    getShoppingRequestOrThrow: vi.fn(),
    updateShoppingRequest: updateShoppingRequestMock,
    ShoppingRequestNotFoundError: class ShoppingRequestNotFoundError extends Error {},
    ShoppingRequestValidationError: class ShoppingRequestValidationError extends Error {},
  }),
);

import * as route from "../route";

describe("PATCH shopping request", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockResolvedValue({
      id: "owner-1",
      name: "Owner",
      storeId: "store-main",
    });
    updateShoppingRequestMock.mockResolvedValue({ id: "request-1" });
  });

  it("uses the dedicated edit permission", async () => {
    expect(route.PATCH).toBeTypeOf("function");
    if (!route.PATCH) return;
    const input = {
      supplierId: "supplier-1",
      note: "Diperbarui",
      items: [
        {
          productId: "product-1",
          requestedQty: 5,
          stockMode: "PRODUCT_ONLY",
        },
      ],
    };
    const response = await route.PATCH(
      new Request("http://localhost/api/suppliers/shopping-requests/request-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
      { params: Promise.resolve({ id: "request-1" }) },
    );

    expect(response.status).toBe(200);
    expect(requirePermissionMock).toHaveBeenCalledWith(
      "supplier.shopping_request.edit",
      "update",
    );
    expect(updateShoppingRequestMock).toHaveBeenCalledWith(
      "request-1",
      input,
      expect.objectContaining({ id: "owner-1" }),
    );
  });
});
