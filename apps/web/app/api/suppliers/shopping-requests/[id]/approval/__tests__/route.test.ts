import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const approveShoppingRequestMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: () => null,
}));

vi.mock(
  "@/features/suppliers/shopping-requests/services/shopping-requests-service",
  () => ({
    approveShoppingRequest: approveShoppingRequestMock,
    ShoppingRequestNotFoundError: class ShoppingRequestNotFoundError extends Error {},
    ShoppingRequestValidationError: class ShoppingRequestValidationError extends Error {},
  }),
);

import { POST } from "../route";

describe("POST /api/suppliers/shopping-requests/[id]/approval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockResolvedValue({
      id: "owner-1",
      name: "Owner",
      role: "OWNER",
      storeId: "store-main",
    });
    approveShoppingRequestMock.mockResolvedValue({ id: "request-1" });
  });

  it("uses the configurable stock approval permission and accepts final stock modes", async () => {
    const response = await POST(
      new Request("http://localhost/api/suppliers/shopping-requests/request-1/approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmOverRequested: true,
          items: [
            {
              id: "item-1",
              stockMode: "GROUP_STOCK",
            },
          ],
        }),
      }),
      { params: Promise.resolve({ id: "request-1" }) },
    );

    expect(response.status).toBe(200);
    expect(requirePermissionMock).toHaveBeenCalledWith(
      "supplier.shopping_request.approve_stock",
      "update",
    );
    expect(approveShoppingRequestMock).toHaveBeenCalledWith(
      "request-1",
      {
        confirmOverRequested: true,
        items: [
          { id: "item-1", stockMode: "GROUP_STOCK" },
        ],
      },
      expect.objectContaining({ id: "owner-1" }),
    );
  });

  it("rejects approvals above the 100-item transaction limit", async () => {
    const response = await POST(
      new Request("http://localhost/api/suppliers/shopping-requests/request-1/approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: Array.from({ length: 101 }, (_, index) => ({
            id: `item-${index + 1}`,
            stockMode: "PRODUCT_ONLY",
          })),
        }),
      }),
      { params: Promise.resolve({ id: "request-1" }) },
    );

    expect(response.status).toBe(422);
    expect(approveShoppingRequestMock).not.toHaveBeenCalled();
  });
});
