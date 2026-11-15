import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CatalogClassificationFilter, fetchClassificationCatalog } from "../CatalogClassificationFilter";

const mocks = vi.hoisted(() => ({ cached: vi.fn() }));
vi.mock("@/lib/offline/offline-db", () => ({ getCachedCatalogProducts: mocks.cached }));

describe("catalog classification filter", () => {
  beforeEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); });

  it("offers only subcategories from the chosen main category", () => {
    const client = new QueryClient();
    client.setQueryData(["product-classification", "catalog"], {
      subcategories: [
        { id: "atk", group: "ATK", name: "Kertas", legacyCategoryId: null },
        { id: "print", group: "PERCETAKAN", name: "PRINT", legacyCategoryId: null },
      ], legacyCategories: [],
    });
    const html = renderToStaticMarkup(<QueryClientProvider client={client}>
      <CatalogClassificationFilter idPrefix="products" group="PERCETAKAN" subcategoryId="" onChange={vi.fn()} />
    </QueryClientProvider>);
    expect(html).toContain('for="products-catalog-group"');
    expect(html).toContain('for="products-catalog-subcategory"');
    expect(html).toContain("Belum diatur");
    expect(html).toContain('value="print"');
    expect(html).not.toContain('value="atk"');
  });

  it("derives offline choices from each cached unit for the current cashier", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    mocks.cached.mockResolvedValue([{ catalogSubcategory: null, variants: [
      { catalogSubcategory: { id: "atk", group: "ATK", name: "Kertas", legacyCategoryId: null } },
      { catalogSubcategory: { id: "print", group: "PERCETAKAN", name: "PRINT", legacyCategoryId: null } },
    ] }]);
    const identity = { cashierId: "cashier", storeId: "store" };
    const result = await fetchClassificationCatalog(undefined, identity);
    expect(result.subcategories.map(item => item.id)).toEqual(["atk", "print"]);
    expect(mocks.cached).toHaveBeenCalledWith(undefined, undefined, false, identity);
  });

  it("does not fall back to cached classifications when access is denied", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 403 })));
    await expect(fetchClassificationCatalog()).rejects.toThrow();
    expect(mocks.cached).not.toHaveBeenCalled();
  });
});
