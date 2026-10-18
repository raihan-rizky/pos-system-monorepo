import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { invalidateCategoryCatalog, requestCategoryAction, categoryRowErrors } from "../hooks/useCategoryManagement";
const db = vi.hoisted(() => ({ products: vi.fn(), categories: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/offline/offline-db", () => ({ offlineDb: { catalogProducts: { clear: db.products }, catalogCategories: { clear: db.categories }, transaction: db.transaction } }));

beforeEach(() => { vi.restoreAllMocks(); db.transaction.mockImplementation(async (...args: unknown[]) => (args.at(-1) as () => Promise<void>)()); });

describe("category management requests", () => {
  it("sends explicit selected IDs and requests uncached server impact", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ kind: "move", token: "server" })));
    await requestCategoryAction({ action: "preview-move", productIds: ["p1", "p7"], targetCategoryId: "next" });
    expect(fetchMock).toHaveBeenCalledWith("/api/categories/manage", expect.objectContaining({ cache: "no-store", method: "POST", body: JSON.stringify({ action: "preview-move", productIds: ["p1", "p7"], targetCategoryId: "next" }) }));
  });
  it("retains preview conflicts and per-row validation details", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ message: "Dampak berubah", code: "PREVIEW_CHANGED", errors: { "categories.1.name": ["Nama sudah digunakan"] } }), { status: 409 }));
    const error = await requestCategoryAction({ action: "create", categories: [] }).catch(e => e);
    expect(error).toMatchObject({ message: "Dampak berubah", status: 409, code: "PREVIEW_CHANGED" });
    expect(categoryRowErrors(error, 1)).toContain("Nama sudah digunakan");
    expect(categoryRowErrors(error, 0)).toEqual([]);
  });
  it("turns network failures into an actionable Indonesian message", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(requestCategoryAction({ action: "preview-move", productIds: ["p1"], targetCategoryId: "next" })).rejects.toThrow("Periksa koneksi internet");
  });
  it("cancels old requests before clearing offline prices then refreshes all affected queries", async () => {
    const client = new QueryClient();
    const steps: string[] = [];
    vi.spyOn(client, "cancelQueries").mockImplementation(async () => { steps.push("cancel"); });
    vi.spyOn(client, "invalidateQueries").mockImplementation(async ({ queryKey } = {}) => { steps.push(String(queryKey?.[0])); });
    db.products.mockImplementation(async () => { steps.push("clear products"); });
    db.categories.mockImplementation(async () => { steps.push("clear categories"); });
    await invalidateCategoryCatalog(client);
    expect(steps.slice(0, 4)).toEqual(["cancel", "cancel", "clear products", "clear categories"]);
    for (const key of ["categories", "products", "product-stats", "customer-category-pricing-rules", "pricing-scope-units", "pricing-scope-options"]) expect(steps.indexOf(key)).toBeGreaterThan(3);
  });
});
