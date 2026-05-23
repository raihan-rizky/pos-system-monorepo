import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../route";

const requireRoleMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const productPriceLogFindManyMock = vi.hoisted(() => vi.fn());
const productPriceLogCountMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requireRole: requireRoleMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    productPriceLog: {
      findMany: productPriceLogFindManyMock,
      count: productPriceLogCountMock,
    },
  },
  Prisma: {},
}));

describe("GET /api/products/price-logs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireRoleMock.mockResolvedValue({
      id: "user-1",
      name: "Owner User",
      role: "OWNER",
      storeId: "store-main",
    });
    handleAuthErrorMock.mockReturnValue(null);
    productPriceLogFindManyMock.mockResolvedValue([]);
    productPriceLogCountMock.mockResolvedValue(0);
  });

  it("requires OWNER or ADMIN because HPP is sensitive", async () => {
    const request = new NextRequest("http://localhost/api/products/price-logs");

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(requireRoleMock).toHaveBeenCalledWith("OWNER", "ADMIN");
  });

  it("returns paginated logs filtered by product, field, and source", async () => {
    productPriceLogFindManyMock.mockResolvedValue([
      {
        id: "price-log-1",
        productId: "product-1",
        storeId: "store-main",
        field: "PRICE",
        oldValue: "15000.00",
        newValue: "17000.00",
        source: "MANUAL",
        note: "Penyesuaian supplier",
        changedBy: "user-1",
        changedByName: "Owner User",
        createdAt: new Date("2026-05-23T06:00:00.000Z"),
        product: {
          id: "product-1",
          name: "Banner Flexi",
          sku: "BNR-FLX",
          category: { name: "Jasa Cetak", icon: "Package" },
        },
      },
    ]);
    productPriceLogCountMock.mockResolvedValue(1);

    const request = new NextRequest(
      "http://localhost/api/products/price-logs?productId=product-1&field=PRICE&source=MANUAL&page=2&limit=10",
    );
    const response = await GET(request);
    const body = await response.json();

    expect(productPriceLogFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          storeId: "store-main",
          productId: "product-1",
          field: "PRICE",
          source: "MANUAL",
        },
        orderBy: { createdAt: "desc" },
        skip: 10,
        take: 10,
      }),
    );
    expect(body).toEqual({
      data: [
        expect.objectContaining({
          id: "price-log-1",
          product: expect.objectContaining({ name: "Banner Flexi" }),
        }),
      ],
      pagination: {
        total: 1,
        page: 2,
        limit: 10,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: true,
      },
    });
  });

  it("filters logs by created date range", async () => {
    const request = new NextRequest(
      "http://localhost/api/products/price-logs?from=2026-05-01&to=2026-05-23",
    );

    await GET(request);

    expect(productPriceLogFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: {
            gte: new Date("2026-05-01T00:00:00.000Z"),
            lte: new Date("2026-05-23T23:59:59.999Z"),
          },
        }),
      }),
    );
  });
});
