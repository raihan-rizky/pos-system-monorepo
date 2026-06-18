import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const productFindManyMock = vi.hoisted(() => vi.fn());
const categoryFindManyMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    product: {
      findMany: productFindManyMock,
    },
    category: {
      findMany: categoryFindManyMock,
    },
  },
}));

describe("POST /api/products/import/preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({
      id: "user-1",
      name: "Owner",
      storeId: "store-main",
    });
    productFindManyMock.mockResolvedValue([
      {
        id: "prod-1",
        name: "Fotocopy A4",
        sku: "FC-A4",
        unit: "lembar",
        price: 500,
        costPrice: 100,
        stockGroupId: "group-1",
        category: { name: "Jasa" },
        stockGroup: { baseUnit: "lembar" },
      },
    ]);
    categoryFindManyMock.mockResolvedValue([{ name: "Jasa" }]);
  });

  it("returns an auto-skip decision for case-insensitive duplicate product names after abbreviation expansion", async () => {
    const formData = new FormData();
    formData.set(
      "file",
      new File(
        ["name,sku,category,price,stock,unit,costPrice\nfc a4,IMPORT-1,jasa,500,10,lembar,100"],
        "products.csv",
        { type: "text/csv" },
      ),
    );

    const response = await POST(
      new Request("http://localhost/api/products/import/preview", {
        method: "POST",
        body: formData,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.rows[0]).toEqual(
      expect.objectContaining({
        autoAction: "auto_skip",
        matchedProductId: "prod-1",
        normalizedProductKey: "fotocopy a4|jasa",
      }),
    );
  });
});
