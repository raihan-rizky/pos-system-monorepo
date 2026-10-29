import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPricingTestDatabase } from "@/features/product-stock-groups/__tests__/pricing-test-database";
const mocks = vi.hoisted(() => ({ permission: vi.fn(), auth: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/rbac/guard", () => ({ requirePermission: mocks.permission, handleAuthError: mocks.auth }));
vi.mock("@pos/db", () => ({ db: { $transaction: mocks.transaction } }));
describe("group conversion", () => {
  let data: ReturnType<typeof createPricingTestDatabase>;
  beforeEach(() => { vi.clearAllMocks(); data = createPricingTestDatabase(); mocks.permission.mockResolvedValue({ id: "u", storeId: "store-main" }); mocks.auth.mockReturnValue(null); mocks.transaction.mockImplementation(fn => fn(data.tx)); });
  const change = { mode: "KEEP_SHARED_STOCK", directMultipliers: [{ productId: "rim", unitMultiplierToBase: 1 }, { productId: "dus", unitMultiplierToBase: 4 }] };
  async function call(body: object, preview = false) { const route = await import("../route"); return (preview ? route.POST : route.PATCH)(new Request("http://localhost/conversion", { method: preview ? "POST" : "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id: "group-1" }) }); }
  it("updates conversion and price/HPP in one transaction while keeping shared stock", async () => {
    data.group.pricingConfig = { sourceProductId: "rim", revision: 1, initializationVersion: 1, members: {
      rim: { mode: "AUTO", factor: { numerator: "1", denominator: "1" }, review: { price: [], costPrice: [] } },
      dus: { mode: "AUTO", factor: { numerator: "9", denominator: "10" }, review: { price: [], costPrice: [] } },
    } };
    const response = await call(change); expect(response.status).toBe(200);
    expect(data.products[1]).toMatchObject({ unitMultiplierToBase: 4, price: "180000.00", costPrice: "160000.00" });
    expect(data.group.baseStock).toBe(20); expect(data.activities).toEqual(expect.arrayContaining([expect.objectContaining({ type: "CONVERSION_RATE_CHANGED" }), expect.objectContaining({ type: "GROUP_PRICING_CHANGED" })]));
    expect(data.locks).toEqual(["group:group-1", "product:dus", "product:rim"]);
    expect(data.raw.product.update).toHaveBeenCalledWith({ where: { id: "dus" }, data: { unitMultiplierToBase: 4, conversionNeedsReview: false } });
  });
  it("previews on the server without writes and applies only matching preview", async () => {
    data.group.pricingConfig = { sourceProductId: "rim", revision: 1, initializationVersion: 1, members: {
      rim: { mode: "AUTO", factor: { numerator: "1", denominator: "1" }, review: { price: [], costPrice: [] } },
      dus: { mode: "AUTO", factor: { numerator: "9", denominator: "10" }, review: { price: [], costPrice: [] } },
    } };
    const response = await call(change, true); expect(response.status).toBe(200); const preview = await response.json();
    expect(data.products[1].unitMultiplierToBase).toBe(5); expect(data.logs).toEqual([]); expect(data.activities).toEqual([]);
    expect(preview.pricing.after.members.find((m: { productId: string }) => m.productId === "dus").price).toBe("180000.00");
    const applied = await call({ ...change, expectedVersion: preview.pricing.version, expectedProjection: preview.pricing.projectionToken }); expect(applied.status).toBe(200);
  });
  it("rejects stale version before writing conversion or prices", async () => {
    const preview = await (await call(change, true)).json(); data.products[0].price = "51000";
    const response = await call({ ...change, expectedVersion: preview.pricing.version, expectedProjection: preview.pricing.projectionToken });
    expect(response.status).toBe(409); expect(data.products[1].unitMultiplierToBase).toBe(5); expect(data.logs).toEqual([]);
  });
  it("rejects stock-only changes and different stock intent after preview", async () => {
    const preview = await (await call(change, true)).json();
    const tokens = { expectedVersion: preview.pricing.version, expectedProjection: preview.pricing.projectionToken };
    expect((await call({ ...change, mode: "PRESERVE_SOURCE_STOCK", sourceProductId: "rim", ...tokens })).status).toBe(409);
    data.group.baseStock = 21;
    expect((await call({ ...change, ...tokens })).status).toBe(409);
    expect(data.raw.product.update).not.toHaveBeenCalled();
  });
  it("rejects a pair whose source and target are the same", async () => {
    const response = await call({ mode: "KEEP_SHARED_STOCK", conversionPairs: [{ fromProductId: "rim", fromQuantity: 1, toProductId: "rim", toQuantity: 1 }] });
    expect(response.status).toBe(422); expect(data.raw.product.update).not.toHaveBeenCalled();
  });
  it("reloads stock only after group/member locks", async () => {
    data.raw.$queryRaw.mockImplementation(async (strings, ...values) => { data.locks.push(`${strings.join("").includes("pos_product_stock_groups") ? "group" : "product"}:${values[0]}`); if (values[0] === "rim") data.group.baseStock = 10; return [{ id: values[0] }]; });
    expect((await call({ ...change, mode: "PRESERVE_SOURCE_STOCK", sourceProductId: "rim" })).status).toBe(200); expect(data.group.baseStock).toBe(10);
    expect(data.raw.$queryRaw.mock.invocationCallOrder[2]).toBeLessThan(data.raw.productStockGroup.findFirst.mock.invocationCallOrder[1]);
    expect(data.raw.productStockGroup.update).toHaveBeenCalledWith({ where: { id: "group-1" }, data: { baseUnit: "rim", baseStock: 10 } });
  });
  it("rejects changed membership during locking", async () => {
    data.raw.$queryRaw.mockImplementation(async (_strings, ...values) => { if (values[0] === "rim") data.products.splice(1, 1); return [{ id: values[0] }]; });
    expect((await call(change)).status).toBe(409); expect(data.logs).toEqual([]);
    expect(data.raw.productStockGroup.update).not.toHaveBeenCalled(); expect(data.raw.product.update).not.toHaveBeenCalled();
  });
});
