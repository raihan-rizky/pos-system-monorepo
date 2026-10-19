import { describe, expect, it, vi } from "vitest";

const requirePermission = vi.hoisted(() => vi.fn().mockResolvedValue({ id: "user-1", name: "Admin", storeId: "store-1" }));
const finalizeShoppingRequest = vi.hoisted(() => vi.fn().mockResolvedValue({ shoppingRequestId: "request-1", goodsPurchaseId: "purchase-1" }));
const rejectShoppingRequest = vi.hoisted(() => vi.fn().mockResolvedValue({ id: "request-1", status: "REJECTED" }));
const sendRolePushEvent = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: (callback: () => Promise<void>) => { void callback(); } }));
vi.mock("@/lib/rbac/guard", () => ({ requirePermission, handleAuthError: () => null }));
vi.mock("@/lib/push-events", () => ({ sendRolePushEvent }));
vi.mock("@/features/suppliers/shopping-requests/services/finalize-shopping-request", () => ({ finalizeShoppingRequest, FinalApprovalError: class extends Error {} }));
vi.mock("@/features/suppliers/shopping-requests/services/reject-shopping-request", () => ({ rejectShoppingRequest }));

import { POST as finalize } from "../finalize/route";
import { POST as reject } from "../reject/route";

const context = { params: Promise.resolve({ id: "request-1" }) };

describe("unified shopping request approval routes", () => {
  it("passes giro payment details to the approval service", async () => {
    finalizeShoppingRequest.mockClear();
    const response = await finalize(new Request("http://localhost/api", {
      method: "POST", body: JSON.stringify({
        items: [{ shoppingRequestItemId: "item-1", productId: "product-1", approvedQty: 2, latestUnitPrice: 5000, updateMasterHpp: false }],
        paymentMethod: "GIRO", paymentDueDate: "2026-11-02",
      }),
    }), context);
    expect(response.status).toBe(200);
    expect(finalizeShoppingRequest).toHaveBeenCalledWith("request-1", expect.objectContaining({
      paymentMethod: "GIRO", paymentDueDate: "2026-11-02",
    }), expect.anything());
  });

  it.each([
    { paymentMethod: "GIRO" },
    { paymentMethod: "GIRO", paymentDueDate: "2026-02-30" },
    { paymentMethod: "CASH" },
  ])("rejects invalid payment details before writing: %j", async (payment) => {
    finalizeShoppingRequest.mockClear();
    const response = await finalize(new Request("http://localhost/api", {
      method: "POST", body: JSON.stringify({
        items: [{ shoppingRequestItemId: "item-1", productId: "product-1", approvedQty: 2, latestUnitPrice: 5000, updateMasterHpp: false }],
        ...payment,
      }),
    }), context);
    expect(response.status).toBe(422);
    expect(finalizeShoppingRequest).not.toHaveBeenCalled();
  });

  it("requires purchase approval permission and sends all decisions once", async () => {
    const response = await finalize(new Request("http://localhost/api", {
      method: "POST", body: JSON.stringify({
        items: [{ shoppingRequestItemId: "item-1", productId: "product-1", approvedQty: 2, latestUnitPrice: 5000, updateMasterHpp: false }],
        extraItems: [],
      }),
    }), context);
    expect(response.status).toBe(200);
    expect(requirePermission).toHaveBeenCalledWith("supplier.goods_purchase.approve", "update");
    expect(finalizeShoppingRequest).toHaveBeenCalledWith("request-1", expect.objectContaining({ items: expect.any(Array) }), expect.objectContaining({ storeId: "store-1" }));
    expect(sendRolePushEvent).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ url: "/suppliers?tab=shopping-requests" }) }));
  });

  it("rejects malformed approval before writing", async () => {
    finalizeShoppingRequest.mockClear();
    const response = await finalize(new Request("http://localhost/api", { method: "POST", body: JSON.stringify({ items: [], extraItems: [] }) }), context);
    expect(response.status).toBe(422);
    expect(finalizeShoppingRequest).not.toHaveBeenCalled();
  });

  it("requires purchase rejection permission and a reason", async () => {
    const response = await reject(new Request("http://localhost/api", { method: "POST", body: JSON.stringify({ reason: "Harga belum sesuai" }) }), context);
    expect(response.status).toBe(200);
    expect(requirePermission).toHaveBeenCalledWith("supplier.goods_purchase.reject", "update");
    expect(rejectShoppingRequest).toHaveBeenCalledWith("request-1", "Harga belum sesuai", expect.objectContaining({ storeId: "store-1" }));
  });
});
