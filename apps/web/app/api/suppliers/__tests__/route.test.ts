import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const supplierCountMock = vi.hoisted(() => vi.fn());
const supplierFindManyMock = vi.hoisted(() => vi.fn());
const supplierCreateMock = vi.hoisted(() => vi.fn());
const dbTransactionMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@/lib/logger", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("@pos/db", () => ({
  db: {
    $transaction: dbTransactionMock,
    supplier: {
      count: supplierCountMock,
      findMany: supplierFindManyMock,
      create: supplierCreateMock,
    },
  },
}));

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/suppliers", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function get(url = "http://localhost/api/suppliers") {
  return GET(new Request(url));
}

describe("/api/suppliers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({
      id: "admin-1",
      name: "Admin",
      role: "ADMIN",
    });
    supplierCountMock.mockResolvedValue(1);
    supplierFindManyMock.mockResolvedValue([
      {
        id: "supplier-1",
        name: "CV Sinar Jaya",
        type: "DISTRIBUTOR",
        phone: null,
        contactPerson: null,
        address: null,
        notes: null,
        isActive: true,
        createdAt: new Date("2026-06-01T00:00:00.000Z"),
        updatedAt: new Date("2026-06-01T00:00:00.000Z"),
      },
    ]);
    supplierCreateMock.mockImplementation(async ({ data }) => ({
      id: "supplier-new",
      ...data,
      createdAt: new Date("2026-06-06T00:00:00.000Z"),
      updatedAt: new Date("2026-06-06T00:00:00.000Z"),
    }));
    dbTransactionMock.mockImplementation(async (calls) =>
      Promise.all(calls.map((call: Promise<unknown>) => call)),
    );
  });

  it("lists suppliers with pagination through the supplier read permission", async () => {
    const response = await get("http://localhost/api/suppliers?q=sinar&page=2&limit=10");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(requirePermissionMock).toHaveBeenCalledWith("supplier", "read");
    expect(supplierFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
        where: expect.objectContaining({
          OR: expect.any(Array),
        }),
      }),
    );
    expect(body.data).toHaveLength(1);
    expect(body.pagination).toEqual(
      expect.objectContaining({ page: 2, limit: 10, total: 1 }),
    );
  });

  it("creates a supplier and returns a non-blocking duplicate-name warning", async () => {
    const response = await post({
      name: " cv   sinar jaya ",
      type: "DISTRIBUTOR",
      phone: "081234",
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(requirePermissionMock).toHaveBeenCalledWith("supplier", "create");
    expect(supplierCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "cv   sinar jaya",
          type: "DISTRIBUTOR",
          phone: "081234",
        }),
      }),
    );
    expect(body.data.id).toBe("supplier-new");
    expect(body.warnings).toEqual([
      {
        code: "DuplicateSupplierName",
        message: "Nama supplier mirip sudah ada.",
        matchedSupplierIds: ["supplier-1"],
      },
    ]);
  });

  it("rejects invalid supplier type with the canonical validation envelope", async () => {
    const response = await post({ name: "Supplier Baru", type: "BAD_TYPE" });
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.code).toBe("ValidationError");
    expect(body.errors.type).toBeDefined();
    expect(supplierCreateMock).not.toHaveBeenCalled();
  });
});
