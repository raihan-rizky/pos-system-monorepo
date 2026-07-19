import { existsSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const approveItemMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: () => null,
}));

vi.mock(
  "@/features/suppliers/shopping-requests/services/shopping-requests-service",
  () => ({
    approveShoppingRequestItem: approveItemMock,
    ShoppingRequestNotFoundError: class ShoppingRequestNotFoundError extends Error {},
    ShoppingRequestValidationError: class ShoppingRequestValidationError extends Error {},
  }),
);

describe("POST individual item approval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockResolvedValue({
      id: "owner-1",
      name: "Owner",
      storeId: "store-main",
    });
    approveItemMock.mockResolvedValue({ id: "request-1" });
  });

  it("uses stock approval permission and consumes the saved quantity", async () => {
    const routePath = join(
      process.cwd(),
      "app/api/suppliers/shopping-requests/[id]/items/[itemId]/approval/route.ts",
    );
    expect(existsSync(routePath)).toBe(true);
    if (!existsSync(routePath)) return;
    const { POST } = await import("../route");
    const response = await POST(
      new Request("http://localhost/api/suppliers/shopping-requests/request-1/items/item-1/approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stockMode: "GROUP_STOCK",
          confirmOverRequested: true,
        }),
      }),
      {
        params: Promise.resolve({ id: "request-1", itemId: "item-1" }),
      },
    );

    expect(response.status).toBe(200);
    expect(requirePermissionMock).toHaveBeenCalledWith(
      "supplier.shopping_request.approve_stock",
      "update",
    );
    expect(approveItemMock).toHaveBeenCalledWith(
      "request-1",
      "item-1",
      { stockMode: "GROUP_STOCK", confirmOverRequested: true },
      expect.objectContaining({ id: "owner-1" }),
    );
  });
});
