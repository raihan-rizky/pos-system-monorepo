import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  requirePermission: vi.fn(), count: vi.fn(), products: vi.fn(), categories: vi.fn(), transaction: vi.fn(),
}));
vi.mock("@/lib/rbac/guard", () => ({ requirePermission: state.requirePermission, handleAuthError: () => null }));
vi.mock("@/features/customer-category-pricing/helpers/base-cost", () => ({ loadProductBaseCosts: async () => new Map() }));
vi.mock("@pos/db", () => ({ db: { $transaction: state.transaction } }));

import { GET } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
  state.requirePermission.mockResolvedValue({ id: "cashier-1", storeId: "store-1" });
  state.count.mockResolvedValue(0);
  state.products.mockResolvedValue([]);
  state.categories.mockResolvedValue([{ id: "category-1", name: "ATK" }]);
  state.transaction.mockImplementation(async (callback) => callback({
    product: { count: state.count, findMany: state.products }, category: { findMany: state.categories },
  }));
});

it("binds a complete snapshot to the authenticated cashier and store", async () => {
  const response = await GET();
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ cashierId: "cashier-1", storeId: "store-1", products: [], categories: [{ id: "category-1" }] });
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(state.transaction.mock.calls[0][1]).toMatchObject({ isolationLevel: "RepeatableRead" });
  expect(state.products.mock.calls[0][0].where).toMatchObject({ storeId: "store-1", isActive: true });
});

it("refuses to save a partial snapshot when the catalog is too large", async () => {
  state.count.mockResolvedValue(5001);
  const response = await GET();
  expect(response.status).toBe(422);
  expect(state.products).not.toHaveBeenCalled();
  expect(state.categories).not.toHaveBeenCalled();
});

it("limits category counts in the snapshot to the current store", async () => {
  await GET();
  expect(state.categories.mock.calls[0][0].include._count.select.products).toEqual({ where: { storeId: "store-1" } });
});
