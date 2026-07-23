import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermission = vi.hoisted(() => vi.fn());
const handleAuthError = vi.hoisted(() => vi.fn());
const listGoodsPurchasesPage = vi.hoisted(() => vi.fn());
const createGoodsPurchase = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission,
  handleAuthError,
}));
vi.mock("@/lib/logger", () => ({
  getLogger: () => ({ error: vi.fn() }),
}));
vi.mock(
  "@/features/suppliers/goods-purchases/services/goods-purchases-service",
  () => ({
    listGoodsPurchasesPage,
    createGoodsPurchase,
    GoodsPurchaseNotFoundError: class extends Error {},
    GoodsPurchaseValidationError: class extends Error {
      isConflict = false;
    },
  }),
);

import { GET, POST } from "../route";

describe("/api/suppliers/goods-purchases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthError.mockReturnValue(null);
    requirePermission.mockResolvedValue({
      id: "owner-1",
      name: "Owner",
      storeId: "store-1",
    });
    listGoodsPurchasesPage.mockResolvedValue({
      total: 0,
      purchases: [],
    });
    createGoodsPurchase.mockResolvedValue({ id: "purchase-1" });
  });

  it("lists tenant purchases with supplier read permission", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/suppliers/goods-purchases?page=1&status=PENDING",
      ),
    );

    expect(response.status).toBe(200);
    expect(requirePermission).toHaveBeenCalledWith("supplier", "read");
    expect(listGoodsPurchasesPage).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: "store-1",
        status: "PENDING",
      }),
    );
  });

  it("creates a pending purchase with supplier create permission", async () => {
    const response = await POST(
      new Request("http://localhost/api/suppliers/goods-purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shoppingRequestId: "request-1",
          items: [
            {
              shoppingRequestItemId: "request-item-1",
              productId: "product-1",
              quantity: 2,
              latestUnitPrice: 10_000,
              updateMasterHpp: false,
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(requirePermission).toHaveBeenCalledWith("supplier", "create");
    expect(createGoodsPurchase).toHaveBeenCalledWith(
      expect.objectContaining({ shoppingRequestId: "request-1" }),
      { id: "owner-1", name: "Owner", storeId: "store-1" },
    );
  });

  it("rejects users without a store", async () => {
    requirePermission.mockResolvedValueOnce({
      id: "owner-1",
      name: "Owner",
      storeId: null,
    });

    const response = await GET(
      new Request("http://localhost/api/suppliers/goods-purchases"),
    );

    expect(response.status).toBe(403);
    expect(listGoodsPurchasesPage).not.toHaveBeenCalled();
  });
});
