import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPricingTestDatabase } from "@/features/product-stock-groups/__tests__/pricing-test-database";
const mocks = vi.hoisted(() => ({ permission: vi.fn(), auth: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/rbac/guard", () => ({ requirePermission: mocks.permission, handleAuthError: mocks.auth }));
vi.mock("@pos/db", () => ({ db: { $transaction: mocks.transaction } }));
describe("variant pricing", () => {
  let data: ReturnType<typeof createPricingTestDatabase>;
  beforeEach(() => { vi.clearAllMocks(); data = createPricingTestDatabase(); mocks.permission.mockResolvedValue({ id: "u", name: "Admin", storeId: "store-main" }); mocks.auth.mockReturnValue(null); mocks.transaction.mockImplementation(fn => fn(data.tx)); });
  async function patch(body: object, productId = "dus") { const { PATCH } = await import("../route"); return PATCH(new Request("http://localhost/pricing", { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id: "group-1", productId }) }); }
  it("updates one Manual variant and writes money history", async () => {
    const response = await patch({ mode: "MANUAL", price: 45000, costPrice: 48000, priceChangeNote: "Promo" });
    expect(response.status).toBe(200); expect((await response.json()).margin.warning).toBe("NEGATIVE_MARGIN");
    expect(data.products[1]).toMatchObject({ price: "45000.00", costPrice: "48000.00" }); expect(data.logs.length).toBeGreaterThan(0);
  });
  it("rejects AUTO follower HPP with actionable Indonesian text", async () => {
    const response = await patch({ price: 45000, costPrice: 48000 }); expect(response.status).toBe(422);
    expect((await response.json()).message).toContain("Manual"); expect(data.logs).toEqual([]);
  });
  it("changes source money, cascades all followers and returns current projection", async () => {
    const response = await patch({ price: 60000, costPrice: null }, "rim"); expect(response.status).toBe(200);
    expect(data.products[1]).toMatchObject({ price: "270000.00", costPrice: "150000.00" });
    expect(data.locks).toEqual(["group:group-1", "product:dus", "product:rim"]);
  });
  it("rejects a product outside this group", async () => { expect((await patch({ price: 4 }, "missing")).status).toBe(422); });
  it("denies group access from another store before money writes", async () => {
    mocks.permission.mockResolvedValue({ id: "u", storeId: "another-store" });
    expect((await patch({ price: 4 })).status).toBe(404);
    expect(data.raw.product.update).not.toHaveBeenCalled(); expect(data.logs).toEqual([]);
  });
});
