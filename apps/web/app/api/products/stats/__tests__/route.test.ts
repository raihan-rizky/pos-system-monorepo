import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ permission: vi.fn(), authError: vi.fn(), query: vi.fn(), observe: vi.fn(), logError: vi.fn() }));
vi.mock("@pos/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@pos/db")>()),
  db: { $queryRaw: mocks.query, $executeRaw: mocks.observe },
}));
vi.mock("@/lib/rbac/guard", () => ({ requirePermission: mocks.permission, handleAuthError: mocks.authError }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ error: mocks.logError }) }));

import { GET } from "../route";

describe("GET product statistics", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.permission.mockResolvedValue({ storeId: "store-1" });
    mocks.authError.mockReturnValue(null);
    mocks.observe.mockResolvedValue(1);
  });

  it("reports an unavailable inventory valuation as null rather than zero", async () => {
    mocks.query.mockResolvedValue([{ total_products: 2n, low_stock: 0n, negative_stock: 0n, inventory_value: null }]);
    const response = await GET(new Request("http://localhost/api/products/stats"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ totalProducts: 2, inventoryValue: null });
  });

  it("returns a known zero without treating it as unavailable", async () => {
    mocks.query.mockResolvedValue([{ total_products: 1n, low_stock: 1n, negative_stock: 1n, inventory_value: "0" }]);
    const response = await GET(new Request("http://localhost/api/products/stats"));
    expect(await response.json()).toMatchObject({ inventoryValue: 0, negativeStock: 1 });
  });

  it("passes the active catalog filters to the shared inventory valuation", async () => {
    mocks.query.mockResolvedValue([{ total_products: 1n, low_stock: 0n, negative_stock: 0n, inventory_value: "72000" }]);
    const response = await GET(new Request("http://localhost/api/products/stats?search=pak&categoryId=paper"));
    const query = mocks.query.mock.calls[0][0];
    expect(query.sql).toContain("pos_current_inventory_valuation");
    expect(query.values).toEqual(expect.arrayContaining(["store-1", "pak", "paper"]));
    expect(await response.json()).toMatchObject({ inventoryValue: 72000 });
  });

  it("observes committed inventory changes only for the authorized store", async () => {
    mocks.query.mockResolvedValue([{ total_products: 1n, low_stock: 0n, negative_stock: 0n, inventory_value: '100' }]);
    const response = await GET(new Request('http://localhost/api/products/stats?storeId=store-2'));
    expect(response.status).toBe(200);
    expect(mocks.permission).toHaveBeenCalledExactlyOnceWith('product', 'read');
    expect(mocks.observe).toHaveBeenCalledTimes(1);
    expect(mocks.observe.mock.calls[0][0].join('?')).toContain('pos_observe_inventory_valuation_v2');
    expect(mocks.observe.mock.calls[0].slice(1)).toEqual(['store-1']);
  });

  it('rejects access without product permission or a store before observing', async () => {
    mocks.permission.mockRejectedValueOnce(new Error('forbidden'));
    mocks.authError.mockReturnValueOnce(new Response(null, { status: 403 }));
    expect((await GET(new Request('http://localhost/api/products/stats'))).status).toBe(403);
    mocks.permission.mockResolvedValueOnce({ storeId: null });
    expect((await GET(new Request('http://localhost/api/products/stats'))).status).toBe(403);
    expect(mocks.observe).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('still returns current statistics when observation fails', async () => {
    mocks.observe.mockRejectedValueOnce(new Error('observer unavailable'));
    mocks.query.mockResolvedValue([{ total_products: 1n, low_stock: 0n, negative_stock: 0n, inventory_value: '100' }]);
    const response = await GET(new Request('http://localhost/api/products/stats'));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ inventoryValue: 100 });
    expect(mocks.logError).toHaveBeenCalled();
  });
});
