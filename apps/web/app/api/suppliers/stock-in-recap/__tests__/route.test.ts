import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const getSupplierStockInRecapMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@/lib/logger", () => ({
  getLogger: () => ({
    error: vi.fn(),
  }),
}));

vi.mock("@/features/suppliers/services/suppliers-service", () => ({
  getSupplierStockInRecap: getSupplierStockInRecapMock,
}));

describe("GET /api/suppliers/stock-in-recap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({
      id: "admin-1",
      name: "Admin",
      role: "ADMIN",
    });
    getSupplierStockInRecapMock.mockResolvedValue({
      total: 1,
      bundles: [
        {
          id: "batch-1",
          kind: "BULK_BATCH",
          batchOperationId: "batch-1",
          supplier: {
            id: "supplier-1",
            name: "CV Sinar Jaya",
            type: "DISTRIBUTOR",
          },
          createdAt: "2026-06-06T07:00:00.000Z",
          decidedAt: "2026-06-06T09:00:00.000Z",
          requesterName: "Admin",
          approverName: "Owner",
          note: "Restock mingguan",
          summary: {
            itemCount: 2,
            approvedItemCount: 1,
            rejectedItemCount: 1,
            approvedQuantity: 3,
            approvedTotalCost: 3000,
            hasPartialCost: false,
            missingCostCount: 0,
          },
          items: [],
        },
      ],
    });
  });

  it("returns bundled stock-in recap with canonical pagination", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/suppliers/stock-in-recap?supplierId=supplier-1&page=2&limit=10",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(requirePermissionMock).toHaveBeenCalledWith("supplier", "read");
    expect(getSupplierStockInRecapMock).toHaveBeenCalledWith(
      expect.objectContaining({
        supplierId: "supplier-1",
        skip: 10,
        take: 10,
      }),
    );
    expect(body.data[0]).toMatchObject({
      id: "batch-1",
      kind: "BULK_BATCH",
      summary: expect.objectContaining({
        approvedTotalCost: 3000,
      }),
    });
    expect(body.pagination).toEqual(
      expect.objectContaining({
        total: 1,
        page: 2,
        limit: 10,
      }),
    );
  });
});
