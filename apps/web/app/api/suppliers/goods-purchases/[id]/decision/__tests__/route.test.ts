import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermission = vi.hoisted(() => vi.fn());
const handleAuthError = vi.hoisted(() => vi.fn());
const rejectGoodsPurchase = vi.hoisted(() => vi.fn());

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
    rejectGoodsPurchase,
    GoodsPurchaseNotFoundError: class extends Error {},
    GoodsPurchaseValidationError: class extends Error {
      isConflict = false;
    },
  }),
);

import { POST } from "../../reject/route";

const context = { params: Promise.resolve({ id: "purchase-1" }) };

describe("goods purchase reject route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthError.mockReturnValue(null);
    requirePermission.mockResolvedValue({
      id: "owner-1",
      name: "Owner",
      storeId: "store-1",
    });
    rejectGoodsPurchase.mockResolvedValue({ id: "purchase-1" });
  });

  it("requires reject permission", async () => {
    const response = await POST(
      new Request(
        "http://localhost/api/suppliers/goods-purchases/purchase-1/reject",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: "Harga terlalu tinggi" }),
        },
      ),
      context,
    );

    expect(response.status).toBe(200);
    expect(requirePermission).toHaveBeenCalledWith(
      "supplier.goods_purchase.reject",
      "update",
    );
  });

  it("returns 422 when reason is empty", async () => {
    const response = await POST(
      new Request(
        "http://localhost/api/suppliers/goods-purchases/purchase-1/reject",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: "   " }),
        },
      ),
      context,
    );

    expect(response.status).toBe(422);
    expect(rejectGoodsPurchase).not.toHaveBeenCalled();
  });
});
