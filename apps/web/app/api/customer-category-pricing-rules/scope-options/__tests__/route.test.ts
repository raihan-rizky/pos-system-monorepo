import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../route";

const mocks = vi.hoisted(() => ({ role: vi.fn(), authError: vi.fn(), products: vi.fn(), rules: vi.fn(), subcategoryRules: vi.fn() }));
vi.mock("@pos/db", () => ({ db: { product: { findMany: mocks.products }, categoryCustomerPricingRule: { findMany: mocks.rules }, subcategoryCustomerPricingRule: { findMany: mocks.subcategoryRules } } }));
vi.mock("@/lib/rbac/guard", () => ({ requireRole: mocks.role, handleAuthError: mocks.authError }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ error: vi.fn() }) }));

const units = [
  { id: "paper-legacy", name: "Kertas", storeId: "store", categoryId: "kertas", catalogSubcategoryId: null, catalogSubcategory: null, unit: "pcs", isActive: true, price: 1000, costPrice: 500, brandId: null, stockGroupId: null },
  { id: "paper-to-print", name: "Kertas", storeId: "store", categoryId: "kertas", catalogSubcategoryId: "print", catalogSubcategory: { legacyCategoryId: null }, unit: "rim", isActive: true, price: 2000, costPrice: 1000, brandId: null, stockGroupId: null },
  { id: "paper-to-bot", name: "Kertas", storeId: "store", categoryId: "kertas", catalogSubcategoryId: "bot-migrated", catalogSubcategory: { legacyCategoryId: "bot" }, unit: "dus", isActive: true, price: 3000, costPrice: 1500, brandId: null, stockGroupId: null },
  { id: "bot-legacy", name: "Bot", storeId: "store", categoryId: "bot", catalogSubcategoryId: null, catalogSubcategory: null, unit: "box", isActive: true, price: 4000, costPrice: 2000, brandId: null, stockGroupId: null },
];

// Evaluate the relevant Prisma conditions against fixture rows rather than
// assuming every query returns the same products.
function matchesWhere(row: (typeof units)[number], where: Record<string, any>): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR") return (value as Record<string, any>[]).some((part) => matchesWhere(row, part));
    if (key === "AND") return (Array.isArray(value) ? value : [value]).every((part) => matchesWhere(row, part));
    if (key === "catalogSubcategory") return row.catalogSubcategory?.legacyCategoryId === value.is.legacyCategoryId;
    if (key === "unit" && typeof value === "object") return row.unit.toLowerCase() === value.equals.toLowerCase();
    return row[key as keyof typeof row] === value;
  });
}

describe("pricing scope options", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.role.mockResolvedValue({ id: "owner", storeId: "store" });
    mocks.authError.mockReturnValue(null);
    mocks.rules.mockResolvedValue([{ unit: "pak" }]);
    mocks.subcategoryRules.mockResolvedValue([{ unit: "dus" }]);
    mocks.products.mockImplementation(({ select }) => {
      if (select.unit && !select.id) return Promise.resolve([{ unit: "Pcs" }, { unit: " Rim " }, { unit: "rim" }]);
      return Promise.resolve([{ id: "rim", storeId: "store", name: "Kertas", unit: "Rim", price: 50000, costPrice: 45000, brandId: "brand", stockGroupId: null }]);
    });
  });
  it("shows unclassified Kertas and migrated BOT units only in their applicable legacy categories", async () => {
    mocks.rules.mockResolvedValue([]);
    mocks.products.mockImplementation(async ({ where }) => units.filter((row) => matchesWhere(row, where)));
    const paperResponse = await GET(new Request("http://localhost/api/customer-category-pricing-rules/scope-options?categoryId=kertas"));
    const botResponse = await GET(new Request("http://localhost/api/customer-category-pricing-rules/scope-options?categoryId=bot"));
    expect(paperResponse.status).toBe(200);
    expect(botResponse.status).toBe(200);
    const paper = (await paperResponse.json()).data;
    const bot = (await botResponse.json()).data;
    expect(paper.products.map((product: { id: string }) => product.id)).toEqual(["paper-legacy"]);
    expect(paper.units).toEqual(["pcs"]);
    expect(bot.products.map((product: { id: string }) => product.id)).toEqual(["paper-to-bot", "bot-legacy"]);
    expect(bot.units).toEqual(["box", "dus"]);
  });

  it("keeps the legacy category restriction when several units are selected", async () => {
    mocks.products.mockImplementation(async ({ where }) => units.filter((row) => matchesWhere(row, where)));
    const response = await GET(new Request("http://localhost/api/customer-category-pricing-rules/scope-options?categoryId=kertas&view=preview&unit=pcs&unit=dus"));
    expect(response.status).toBe(200);
    expect((await response.json()).data.products.map((product: { id: string }) => product.id)).toEqual(["paper-legacy"]);
  });
  it("returns complete normalized units including saved units and scoped preview products", async () => {
    const response = await GET(new Request("http://localhost/api/customer-category-pricing-rules/scope-options?categoryId=cat&unit=rim&brandId=brand"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { units: ["pak", "pcs", "rim"], products: [{ id: "rim", name: "Kertas", unit: "Rim", price: 50000, costPrice: 45000, brandId: "brand", baseCostPrice: 45000, baseCostUnit: "rim" }] } });
    const category = { OR: [{ categoryId: "cat", catalogSubcategoryId: null }, { catalogSubcategory: { is: { legacyCategoryId: "cat" } } }] };
    expect(mocks.products).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: "store", ...category, isActive: true }, distinct: ["unit"] }));
    expect(mocks.products).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: "store", ...category, isActive: true, unit: { equals: "rim", mode: "insensitive" }, brandId: "brand" }, take: 3 }));
    expect(mocks.role).toHaveBeenCalledWith("OWNER");
  });
  it("requires category before exposing costs", async () => {
    const response = await GET(new Request("http://localhost/api/customer-category-pricing-rules/scope-options"));
    expect(response.status).toBe(422);
    expect(mocks.products).not.toHaveBeenCalled();
  });
  it("loads units and examples only from the selected subcategory", async () => {
    const response = await GET(new Request("http://localhost/api/customer-category-pricing-rules/scope-options?categoryId=print&scope=SUBCATEGORY"));
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.data.units).toContain("dus");
    expect(mocks.products).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: "store", catalogSubcategoryId: "print", isActive: true }, distinct: ["unit"] }));
    expect(mocks.subcategoryRules).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: "store", subcategoryId: "print" } }));
    expect(mocks.rules).not.toHaveBeenCalled();
  });
  it("rejects an unknown scope", async () => {
    const response = await GET(new Request("http://localhost/api/customer-category-pricing-rules/scope-options?categoryId=print&scope=invalid"));
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
  it("samples only the selected units for a multi-unit rule", async () => {
    const response = await GET(new Request("http://localhost/api/customer-category-pricing-rules/scope-options?categoryId=cat&view=preview&unit=rim&unit=box&unit=RIM"));
    expect(response.status).toBe(200);
    expect(mocks.products).toHaveBeenCalledWith(expect.objectContaining({
      where: { storeId: "store", isActive: true, OR: [
        { categoryId: "cat", catalogSubcategoryId: null },
        { catalogSubcategory: { is: { legacyCategoryId: "cat" } } },
      ], AND: [{ OR: [
        { unit: { equals: "rim", mode: "insensitive" } },
        { unit: { equals: "box", mode: "insensitive" } },
      ] }] }, distinct: ["unit"], take: 3,
    }));
  });
});
