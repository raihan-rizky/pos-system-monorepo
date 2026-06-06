import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "../route";
import { SupplierNotFoundError } from "@/features/suppliers/services/suppliers-service";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const getSupplierDetailMock = vi.hoisted(() => vi.fn());
const SupplierNotFoundErrorMock = vi.hoisted(
  () =>
    class SupplierNotFoundError extends Error {
      constructor() {
        super("Supplier not found");
        this.name = "SupplierNotFoundError";
      }
    },
);
const SupplierValidationErrorMock = vi.hoisted(
  () =>
    class SupplierValidationError extends Error {
      constructor(message: string) {
        super(message);
        this.name = "SupplierValidationError";
      }
    },
);

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@/lib/logger", () => ({
  getLogger: () => ({
    error: vi.fn(),
  }),
}));

vi.mock("@/features/suppliers/services/suppliers-service", () => {
  return {
    getSupplierDetail: getSupplierDetailMock,
    SupplierNotFoundError: SupplierNotFoundErrorMock,
    SupplierValidationError: SupplierValidationErrorMock,
  };
});

function context(id = "supplier-1") {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/suppliers/[id]/detail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({
      id: "admin-1",
      name: "Admin",
      role: "ADMIN",
    });
    getSupplierDetailMock.mockResolvedValue({
      supplier: {
        id: "supplier-1",
        name: "CV Sinar Jaya",
        type: "DISTRIBUTOR",
        phone: null,
        contactPerson: "Sinar",
        address: null,
        notes: null,
        isActive: true,
        createdAt: new Date("2026-06-01T00:00:00.000Z"),
        updatedAt: new Date("2026-06-01T00:00:00.000Z"),
      },
      history: {
        items: [
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
              approvedItemCount: 2,
              rejectedItemCount: 0,
              approvedQuantity: 6,
              approvedTotalCost: 6000,
              hasPartialCost: false,
              missingCostCount: 0,
            },
            items: [],
          },
        ],
        pageInfo: {
          nextCursor: "offset:10",
          hasNextPage: true,
        },
      },
    });
  });

  it("returns supplier detail history with cursor pagination", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/suppliers/supplier-1/detail?limit=10&cursor=offset%3A10",
      ),
      context(),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(requirePermissionMock).toHaveBeenCalledWith("supplier", "read");
    expect(getSupplierDetailMock).toHaveBeenCalledWith({
      supplierId: "supplier-1",
      limit: 10,
      cursor: "offset:10",
    });
    expect(body.data.supplier.name).toBe("CV Sinar Jaya");
    expect(body.data.history.pageInfo).toEqual({
      nextCursor: "offset:10",
      hasNextPage: true,
    });
  });

  it("rejects an invalid limit with the canonical validation envelope", async () => {
    const response = await GET(
      new Request("http://localhost/api/suppliers/supplier-1/detail?limit=1000"),
      context(),
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.code).toBe("ValidationError");
    expect(body.errors.limit).toBeDefined();
    expect(getSupplierDetailMock).not.toHaveBeenCalled();
  });

  it("returns not found when the supplier does not exist", async () => {
    getSupplierDetailMock.mockRejectedValueOnce(new SupplierNotFoundError());

    const response = await GET(
      new Request("http://localhost/api/suppliers/missing/detail"),
      context("missing"),
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toMatchObject({
      code: "NotFound",
      message: "Supplier not found",
    });
  });
});
