import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({ permission: vi.fn(), authError: vi.fn(), subcategories: vi.fn(), categories: vi.fn(), products: vi.fn() }));
vi.mock("@/lib/rbac/guard", () => ({ requirePermission: mocks.permission, handleAuthError: mocks.authError }));
vi.mock("@pos/db", () => ({ db: { productSubcategory: { findMany: mocks.subcategories }, category: { findMany: mocks.categories } } }));
vi.mock("@/features/product-classification/server/classification-products", () => ({ listClassificationProducts: mocks.products }));

import { GET as getCatalog } from "../route";
import { GET as getProducts } from "../products/route";

const actor = { id: "user", role: "ADMIN", storeId: "store-a" };

describe("classification catalog API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.permission.mockResolvedValue(actor);
    mocks.authError.mockReturnValue(null);
    mocks.subcategories.mockResolvedValue([
      { id: "bot", group: "ATK", name: "BOT", legacyCategoryId: "legacy" },
      { id: "print", group: "PERCETAKAN", name: "PRINT", legacyCategoryId: null },
      { id: "spanduk", group: "PERCETAKAN", name: "SPANDUK", legacyCategoryId: null },
    ]);
    mocks.categories.mockResolvedValue([{ id: "legacy", name: "BOT" }]);
    mocks.products.mockResolvedValue({ groups: [], total: 0, page: 1, pageCount: 1 });
  });

  it("returns only supported printing destinations for an authorized reader", async () => {
    const response = await getCatalog();
    expect(response.status).toBe(200);
    expect(mocks.permission).toHaveBeenCalledWith("product", "read");
    const body = await response.json();
    expect(body.subcategories.map((row: { id: string }) => row.id)).toEqual(["bot", "print"]);
    expect(body.legacyCategories).toEqual([{ id: "legacy", name: "BOT" }]);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("denies the catalog and group list without product read permission", async () => {
    mocks.permission.mockRejectedValue(new Error("forbidden"));
    mocks.authError.mockReturnValue(NextResponse.json({ message: "Akses ditolak" }, { status: 403 }));
    expect((await getCatalog()).status).toBe(403);
    expect((await getProducts(new Request("http://localhost/api/product-classification/products"))).status).toBe(403);
    expect(mocks.subcategories).not.toHaveBeenCalled();
    expect(mocks.products).not.toHaveBeenCalled();
  });

  it("uses the authenticated store and forwards category and pagination filters", async () => {
    const response = await getProducts(new Request("http://localhost/api/product-classification/products?search=Pulpen&legacyCategoryId=legacy&group=ATK&status=unclassified&page=2&limit=20"));
    expect(response.status).toBe(200);
    expect(mocks.products).toHaveBeenCalledWith("store-a", { search: "Pulpen", legacyCategoryId: "legacy", group: "ATK", status: "unclassified", subcategoryId: undefined, page: 2, limit: 20 });
  });

  it("rejects an unsupported main category", async () => {
    const response = await getProducts(new Request("http://localhost/api/product-classification/products?group=OTHER"));
    expect(response.status).toBe(422);
    expect(mocks.products).not.toHaveBeenCalled();
  });
});
