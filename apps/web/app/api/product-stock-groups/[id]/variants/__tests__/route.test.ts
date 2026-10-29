import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPricingTestDatabase } from "@/features/product-stock-groups/__tests__/pricing-test-database";
const mocks = vi.hoisted(() => ({ permission: vi.fn(), auth: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/rbac/guard", () => ({ requirePermission: mocks.permission, handleAuthError: mocks.auth }));
vi.mock("@pos/db", () => ({ db: { $transaction: mocks.transaction } }));
describe("new unit variants", () => {
  let data: ReturnType<typeof createPricingTestDatabase>;
  beforeEach(() => { vi.clearAllMocks(); data = createPricingTestDatabase(); data.products.splice(1, 1); mocks.permission.mockResolvedValue({ id: "u", storeId: "store-main" }); mocks.auth.mockReturnValue(null); mocks.transaction.mockImplementation(fn => fn(data.tx)); });
  const input = { unit: "dus", price: 1, stock: 4, minStock: 1, conversionPair: { fromQuantity: 1, toProductId: "rim", toQuantity: 5 } };
  async function call(body: object) { const { POST } = await import("../route"); return POST(new Request("http://localhost/variants", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id: "group-1" }) }); }
  it("uses explicit AUTO factor one and returns projected money without adding shared stock", async () => {
    const response = await call({ ...input, pricingMode: "AUTO" }); expect(response.status).toBe(201); const product = await response.json();
    expect(product).toMatchObject({ sku: "HVS-A4-DUS", price: "250000.00", costPrice: "200000.00" });
    expect(data.group.baseStock).toBe(20); expect(data.products[0].stock).toBe(20);
    expect(data.group.pricingConfig).toMatchObject({ members: { "new-variant": { mode: "AUTO", factor: { numerator: "1", denominator: "1" } } } });
    expect(data.logs).toEqual(expect.arrayContaining([expect.objectContaining({ productId: "new-variant", newValue: "250000.00" })]));
    expect(data.activities).toEqual(expect.arrayContaining([expect.objectContaining({ type: "VARIANT_ADDED" })]));
  });
  it("defaults to Manual without changing the submitted price", async () => {
    const response = await call(input); expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ price: "1.00", costPrice: null });
    expect(data.group.pricingConfig).toMatchObject({ members: { "new-variant": { mode: "MANUAL" } } });
  });
  it("supports an explicitly Manual variant", async () => {
    const response = await call({ ...input, pricingMode: "MANUAL", price: 200000, costPrice: 170000 }); expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ price: "200000.00", costPrice: "170000.00" });
  });
  it("rejects duplicate units and invalid conversion membership", async () => {
    const duplicate = await call({ ...input, unit: "rim" });
    expect(duplicate.status).toBe(422); expect((await duplicate.json()).errors.unit).toContain("DUPLICATE_UNIT");
    expect((await call({ ...input, conversionPair: { ...input.conversionPair, toProductId: "foreign" } })).status).toBe(422);
    expect(data.raw.product.create).not.toHaveBeenCalled();
  });
  it("locks the group and member before authoritative reload and creation", async () => {
    expect((await call(input)).status).toBe(201);
    const memberLock = data.raw.$queryRaw.mock.invocationCallOrder[1];
    const reload = data.raw.productStockGroup.findFirst.mock.invocationCallOrder[1];
    const create = data.raw.product.create.mock.invocationCallOrder[0];
    expect(data.locks).toEqual(["group:group-1", "product:rim"]);
    expect(memberLock).toBeLessThan(reload); expect(reload).toBeLessThan(create);
    expect(data.raw.product.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ unit: "dus", unitMultiplierToBase: 5, conversionNeedsReview: false, stockGroupId: "group-1", stock: 4 }) }));
  });
  it("locks all existing members before create and rejects a lock-time membership change", async () => {
    data.raw.$queryRaw.mockImplementation(async (_strings, ...values) => { if (values[0] === "rim") data.products.splice(0); return [{ id: values[0] }]; });
    expect((await call(input)).status).toBe(409); expect(data.raw.product.create).not.toHaveBeenCalled();
    expect(data.activities).toEqual([]);
  });
});
