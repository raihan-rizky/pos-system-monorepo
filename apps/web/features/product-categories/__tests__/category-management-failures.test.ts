import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CategoryRequestError, invalidateCategoryCatalog, requestCategoryAction } from "../hooks/useCategoryManagement";

const offline = vi.hoisted(() => ({ products: vi.fn(), categories: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/offline/offline-db", () => ({
  offlineDb: {
    catalogProducts: { clear: offline.products },
    catalogCategories: { clear: offline.categories },
    transaction: offline.transaction,
  },
}));

beforeEach(() => {
  vi.restoreAllMocks();
  offline.products.mockReset().mockResolvedValue(undefined);
  offline.categories.mockReset().mockResolvedValue(undefined);
  offline.transaction.mockReset().mockImplementation(async (...args: unknown[]) => (args.at(-1) as () => Promise<void>)());
});

describe("category request failures", () => {
  it("keeps the HTTP status and fallback message when a proxy returns HTML", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("<html>Bad Gateway</html>", { status: 502 }));

    const error = await requestCategoryAction({ action: "create", categories: [] }).catch(cause => cause);

    expect(error).toBeInstanceOf(CategoryRequestError);
    expect(error).toMatchObject({ status: 502, message: "Perubahan kategori belum berhasil. Silakan coba lagi." });
  });

  it("does not replay an ambiguous network failure that could already have saved the batch", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Connection reset"));

    await expect(requestCategoryAction({ action: "create", categories: [{ name: "Buku", icon: null, color: null, order: 0, salesGroup: "OTHER" }] }))
      .rejects.toMatchObject({ status: 0, message: expect.stringContaining("muat ulang data untuk memastikan hasil perubahan") });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("category cache recovery", () => {
  it.each(["transaction", "products", "categories"] as const)("refreshes every affected online cache when offline %s fails", async failure => {
    const client = new QueryClient();
    const affected = ["categories", "products", "product-stats", "customer-category-pricing-rules", "pricing-scope-units", "pricing-scope-options"];
    for (const key of [...affected, "customers"]) client.setQueryData([key, "store-one"], { version: "before-change" });
    offline[failure].mockRejectedValueOnce(new Error("IndexedDB unavailable"));

    const offlineCleared = await invalidateCategoryCatalog(client);

    expect(offlineCleared).toBe(false);
    for (const key of affected) expect(client.getQueryState([key, "store-one"])?.isInvalidated, key).toBe(true);
    expect(client.getQueryState(["customers", "store-one"])?.isInvalidated).toBe(false);
    client.clear();
  });
});
