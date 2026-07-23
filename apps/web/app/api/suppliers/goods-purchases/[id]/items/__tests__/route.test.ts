import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermission = vi.hoisted(() => vi.fn());
const handleAuthError = vi.hoisted(() => vi.fn());
const addGoodsPurchaseItem = vi.hoisted(() => vi.fn());
const approveGoodsPurchaseItem = vi.hoisted(() => vi.fn());
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
    addGoodsPurchaseItem,
    approveGoodsPurchaseItem,
    GoodsPurchaseNotFoundError: class extends Error {},
    GoodsPurchaseValidationError: class extends Error {
      isConflict = false;
    },
  }),
);

import { POST as addItem } from "../route";
import { POST as approveItem } from "../[itemId]/approval/route";

const context = { params: Promise.resolve({ id: "purchase-1" }) };
const approvalContext = {
  params: Promise.resolve({
    id: "purchase-1",
    itemId: "item-1",
  }),
};

describe("goods purchase item routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthError.mockReturnValue(null);
    requirePermission.mockResolvedValue({
      id: "owner-1",
      name: "Owner",
      storeId: "store-1",
    });
    addGoodsPurchaseItem.mockResolvedValue({
      data: { id: "purchase-1" },
      finalized: false,
    });
    approveGoodsPurchaseItem.mockResolvedValue({
      data: { id: "purchase-1", number: "PB-202607-001" },
      finalized: true,
    });
    after.mockImplementation(
      (callback: () => void | Promise<void>) => callback(),
    );
    sendRolePushEvent.mockResolvedValue({});
  });

  it("requires approve permission to add another item", async () => {
    const response = await addItem(
      new Request(
        "http://localhost/api/suppliers/goods-purchases/purchase-1/items",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId: "product-1",
            quantity: 1,
            latestUnitPrice: 10_000,
            updateMasterHpp: false,
          }),
        },
      ),
      context,
    );

    expect(response.status).toBe(200);
    expect(requirePermission).toHaveBeenCalledWith(
      "supplier.goods_purchase.approve",
      "update",
    );
    expect(sendRolePushEvent).not.toHaveBeenCalled();
  });

  it("returns finalized state from individual approval", async () => {
    const response = await approveItem(
      new Request(
        "http://localhost/api/suppliers/goods-purchases/purchase-1/items/item-1/approval",
        { method: "POST" },
      ),
      approvalContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ finalized: true }),
    );
    expect(requirePermission).toHaveBeenCalledWith(
      "supplier.goods_purchase.approve",
      "update",
    );
    expect(sendRolePushEvent).toHaveBeenCalledWith({
      eventName: "goods-purchase-approved",
      storeId: "store-1",
      roles: ["OWNER", "ADMIN"],
      featureKey: "shoppingRequests",
      excludeUserIds: ["owner-1"],
      payload: {
        title: "Pembelian Barang disetujui",
        body: "Owner menyetujui PB-202607-001.",
        url: "/suppliers?tab=goods-purchases",
        tag: "goods-purchase:purchase-1",
      },
    });
  });
});
