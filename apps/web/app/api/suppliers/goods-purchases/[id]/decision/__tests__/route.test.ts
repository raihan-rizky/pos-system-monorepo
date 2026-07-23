import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermission = vi.hoisted(() => vi.fn());
const handleAuthError = vi.hoisted(() => vi.fn());
const rejectGoodsPurchase = vi.hoisted(() => vi.fn());
const sendRolePushEvent = vi.hoisted(() => vi.fn());
const after = vi.hoisted(() => vi.fn());

vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>(
    "next/server",
  );
  return { ...actual, after };
});

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission,
  handleAuthError,
}));
vi.mock("@/lib/logger", () => ({
  getLogger: () => ({ error: vi.fn() }),
}));
vi.mock("@/lib/push-events", () => ({ sendRolePushEvent }));
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
    after.mockImplementation(
      (callback: () => void | Promise<void>) => callback(),
    );
    sendRolePushEvent.mockResolvedValue({});
    rejectGoodsPurchase.mockResolvedValue({
      id: "purchase-1",
      number: "PB-202607-001",
    });
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
    expect(sendRolePushEvent).toHaveBeenCalledWith({
      eventName: "goods-purchase-rejected",
      storeId: "store-1",
      roles: ["OWNER", "ADMIN"],
      featureKey: "shoppingRequests",
      excludeUserIds: ["owner-1"],
      payload: {
        title: "Pembelian Barang ditolak",
        body: "Owner menolak PB-202607-001.",
        url: "/suppliers?tab=goods-purchases",
        tag: "goods-purchase:purchase-1",
      },
    });
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
