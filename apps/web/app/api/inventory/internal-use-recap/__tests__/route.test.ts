import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const inventoryLogFindManyMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    inventoryLog: {
      findMany: inventoryLogFindManyMock,
    },
  },
}));

describe("GET /api/inventory/internal-use-recap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockResolvedValue({
      id: "user-1",
      name: "Admin User",
      storeId: "store-main",
    });
    handleAuthErrorMock.mockReturnValue(null);
    inventoryLogFindManyMock.mockResolvedValue([]);
  });

  it("uses product read permission for Products Stock Logs visibility", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/inventory/internal-use-recap"),
    );

    expect(response.status).toBe(200);
    expect(requirePermissionMock).toHaveBeenCalledWith("product", "read");
  });

  it("queries only approved internal usage stock-out rows inside the requested period", async () => {
    await GET(
      new NextRequest(
        "http://localhost/api/inventory/internal-use-recap?period=weekly&date=2026-06-05",
      ),
    );

    expect(inventoryLogFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          product: { storeId: "store-main" },
          type: "OUT",
          reason: "USAGE",
          status: "APPROVED",
          createdAt: {
            gte: new Date("2026-05-31T17:00:00.000Z"),
            lt: new Date("2026-06-07T17:00:00.000Z"),
          },
        }),
        orderBy: [{ createdAt: "desc" }],
      }),
    );
  });

  it("returns a data envelope consumed by the recap panel", async () => {
    inventoryLogFindManyMock.mockResolvedValue([
      {
        id: "log-1",
        productId: "product-1",
        quantity: 2,
        unitCost: "5000",
        note: "Office sample",
        person: "Admin User",
        createdAt: new Date("2026-06-05T03:00:00.000Z"),
        product: {
          id: "product-1",
          name: "Kertas A4",
          sku: "A4",
          unit: "rim",
        },
      },
    ]);

    const response = await GET(
      new NextRequest(
        "http://localhost/api/inventory/internal-use-recap?period=daily&date=2026-06-05",
      ),
    );
    const body = await response.json();

    expect(body.data.summary.totalValue).toBe(10000);
    expect(body.data.products).toHaveLength(1);
    expect(body.data.range.start).toBe("2026-06-05");
  });
});
