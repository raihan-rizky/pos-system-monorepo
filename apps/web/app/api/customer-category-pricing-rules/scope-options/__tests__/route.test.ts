import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../route";

const mocks = vi.hoisted(() => ({ role: vi.fn(), authError: vi.fn(), products: vi.fn(), rules: vi.fn() }));
vi.mock("@pos/db", () => ({ db: { product: { findMany: mocks.products }, categoryCustomerPricingRule: { findMany: mocks.rules } } }));
vi.mock("@/lib/rbac/guard", () => ({ requireRole: mocks.role, handleAuthError: mocks.authError }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ error: vi.fn() }) }));

describe("pricing scope options", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.role.mockResolvedValue({ id: "owner", storeId: "store" });
    mocks.authError.mockReturnValue(null);
    mocks.rules.mockResolvedValue([{ unit: "pak" }]);
    mocks.products.mockImplementation(({ select }) => {
      if (select.unit && !select.id) return Promise.resolve([{ unit: "Pcs" }, { unit: " Rim " }, { unit: "rim" }]);
      return Promise.resolve([{ id: "rim", storeId: "store", name: "Kertas", unit: "Rim", price: 50000, costPrice: 45000, brandId: "brand", stockGroupId: null }]);
    });
  });
  it("returns complete normalized units including saved units and scoped preview products", async () => {
    const response = await GET(new Request("http://localhost/api/customer-category-pricing-rules/scope-options?categoryId=cat&unit=rim&brandId=brand"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { units: ["pak", "pcs", "rim"], products: [{ id: "rim", name: "Kertas", unit: "Rim", price: 50000, costPrice: 45000, brandId: "brand", baseCostPrice: 45000, baseCostUnit: "rim" }] } });
    expect(mocks.products).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: "store", categoryId: "cat", isActive: true }, distinct: ["unit"] }));
    expect(mocks.products).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: "store", categoryId: "cat", isActive: true, unit: { equals: "rim", mode: "insensitive" }, brandId: "brand" }, take: 3 }));
    expect(mocks.role).toHaveBeenCalledWith("OWNER");
  });
  it("requires category before exposing costs", async () => {
    const response = await GET(new Request("http://localhost/api/customer-category-pricing-rules/scope-options"));
    expect(response.status).toBe(422);
    expect(mocks.products).not.toHaveBeenCalled();
  });
  it("returns units independently when preview products cannot be loaded", async () => {
    mocks.products.mockImplementation(({ select }) => select.id
      ? Promise.reject(new Error("Preview unavailable"))
      : Promise.resolve([{ unit: "Pcs" }, { unit: " Rim " }]));
    const response = await GET(new Request("http://localhost/api/customer-category-pricing-rules/scope-options?categoryId=cat&view=units"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { units: ["pak", "pcs", "rim"], products: [] } });
    expect(mocks.products).toHaveBeenCalledTimes(1);
  });
  it("loads preview without querying the full unit list again", async () => {
    mocks.rules.mockRejectedValue(new Error("Unit list unavailable"));
    const response = await GET(new Request("http://localhost/api/customer-category-pricing-rules/scope-options?categoryId=cat&unit=rim&view=preview"));
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.data.products).toHaveLength(1);
    expect(result.data.products[0].baseCostPrice).toBe(45000);
    expect(mocks.rules).not.toHaveBeenCalled();
    expect(mocks.products).toHaveBeenCalledTimes(1);
  });
  it("rejects an unsupported view before querying product data", async () => {
    const response = await GET(new Request("http://localhost/api/customer-category-pricing-rules/scope-options?categoryId=cat&view=unknown"));
    expect(response.status).toBe(422);
    expect(mocks.products).not.toHaveBeenCalled();
  });
  it("samples different units when previewing an all-unit rule", async () => {
    const response = await GET(new Request("http://localhost/api/customer-category-pricing-rules/scope-options?categoryId=cat&view=preview"));
    expect(response.status).toBe(200);
    expect(mocks.products).toHaveBeenCalledWith(expect.objectContaining({ select: expect.objectContaining({ id: true, costPrice: true }), distinct: ["unit"], take: 3 }));
  });
});
