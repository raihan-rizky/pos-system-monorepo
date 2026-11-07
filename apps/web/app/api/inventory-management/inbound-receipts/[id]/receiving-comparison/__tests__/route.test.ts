import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  permission: vi.fn(), authError: vi.fn(), find: vi.fn(), comparison: vi.fn(),
}));
vi.mock("@/lib/rbac/guard", () => ({ requirePermission: state.permission, handleAuthError: state.authError }));
vi.mock("@/features/inventory-management/repositories/InventoryInboundReceiptRepository", () => ({
  InventoryInboundReceiptRepository: class {
    runInTransaction = (callback: (tx: unknown) => unknown) => callback({});
    findReceiptForEdit = state.find;
    getGoodsPurchaseReceivingComparison = state.comparison;
  },
}));
import { GET } from "../route";
const context = { params: Promise.resolve({ id: "receipt-1" }) };
const request = () => new Request("http://localhost/api/inventory-management/inbound-receipts/receipt-1/receiving-comparison");
describe("inventory-scoped receiving comparison", () => {
  beforeEach(() => {
    vi.clearAllMocks(); state.authError.mockReturnValue(null);
    state.permission.mockResolvedValue({ id: "inventory-1", role: "INVENTORY", storeId: "store-1" });
    state.find.mockResolvedValue({ id: "receipt-1", storeId: "store-1", status: "SUBMITTED", goodsPurchaseId: "purchase-1" });
    state.comparison.mockResolvedValue({ goodsPurchaseId: "purchase-1", items: [{ productId: "product-2", remainingQuantity: 8 }] });
  });
  it("loads replacement choices through inventory read without supplier permissions", async () => {
    const response = await GET(request(), context);
    expect(response.status).toBe(200);
    expect(state.permission).toHaveBeenCalledExactlyOnceWith("inventory", "read");
    expect(state.find).toHaveBeenCalledWith(expect.anything(), { storeId: "store-1", receiptId: "receipt-1" });
    expect((await response.json()).data.items[0].productId).toBe("product-2");
    expect(state.comparison).toHaveBeenCalledWith("store-1", "purchase-1");
  });
  it("denies a user without inventory read before reading the receipt", async () => {
    state.permission.mockRejectedValue(new Error("Forbidden")); state.authError.mockReturnValue(new Response(null, { status: 403 }));
    expect((await GET(request(), context)).status).toBe(403);
    expect(state.find).not.toHaveBeenCalled();
  });
  it("does not load a purchase from a receipt outside the user's store", async () => {
    state.find.mockResolvedValue(null);
    expect((await GET(request(), context)).status).toBe(404);
    expect(state.comparison).not.toHaveBeenCalled();
  });
});
