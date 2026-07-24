import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const inventoryLogFindManyMock = vi.hoisted(() => vi.fn());
const inventoryLogCountMock = vi.hoisted(() => vi.fn());
const batchOperationItemFindManyMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    inventoryLog: {
      findMany: inventoryLogFindManyMock,
      count: inventoryLogCountMock,
    },
    batchOperationItem: {
      findMany: batchOperationItemFindManyMock,
    },
  },
  Prisma: {},
}));

describe("GET /api/inventory/logs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockResolvedValue({
      id: "user-1",
      name: "Admin User",
      storeId: "store-main",
    });
    handleAuthErrorMock.mockReturnValue(null);
    inventoryLogFindManyMock.mockResolvedValue([]);
    inventoryLogCountMock.mockResolvedValue(0);
    batchOperationItemFindManyMock.mockResolvedValue([]);
  });

  it("uses product read permission because stock logs are shown inside Products", async () => {
    const request = new NextRequest("http://localhost/api/inventory/logs?page=1&limit=20");

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(requirePermissionMock).toHaveBeenCalledWith("product", "read");
  });

  it("returns the list response shape consumed by the Products Stock Logs tab", async () => {
    inventoryLogFindManyMock.mockResolvedValue([
      {
        id: "log-1",
        productId: "product-1",
        type: "IN",
        reason: "RESTOCK",
        quantity: 5,
        note: "Restock",
        createdBy: "user-1",
        person: "Admin User",
        createdAt: new Date("2026-05-21T05:00:00.000Z"),
        status: "APPROVED",
        approvedBy: "user-1",
        approverName: "Admin User",
        decidedAt: new Date("2026-05-21T05:01:00.000Z"),
        rejectionReason: null,
        product: {
          id: "product-1",
          name: "Banner Flexi",
          sku: "BNR-FLX",
          unit: "meter",
          stock: 12,
          imageUrl: null,
          category: { name: "Jasa Cetak", icon: null },
        },
      },
    ]);
    inventoryLogCountMock
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);

    const request = new NextRequest("http://localhost/api/inventory/logs?page=1&limit=20");
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      data: [
        expect.objectContaining({
          id: "log-1",
          product: expect.objectContaining({ name: "Banner Flexi" }),
          person: "Admin User",
        }),
      ],
      pagination: {
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
        pendingTotal: 0,
      },
    });
  });

  it("filters pending logs and puts recent rows first for a single status filter", async () => {
    const request = new NextRequest(
      "http://localhost/api/inventory/logs?status=PENDING&type=OUT&page=2&limit=10",
    );

    await GET(request);

    expect(inventoryLogFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          product: { storeId: "store-main" },
          type: "OUT",
          status: { in: ["PENDING"] },
        }),
        orderBy: [{ createdAt: "desc" }],
        skip: 10,
        take: 10,
      }),
    );
  });

  it("accepts a comma-separated status filter", async () => {
    const request = new NextRequest(
      "http://localhost/api/inventory/logs?status=APPROVED,REJECTED",
    );

    await GET(request);

    expect(inventoryLogFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ["APPROVED", "REJECTED"] },
        }),
      }),
    );
  });

  it("sorts PENDING rows above historical rows when no status filter is provided", async () => {
    const request = new NextRequest("http://localhost/api/inventory/logs");

    await GET(request);

    expect(inventoryLogFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      }),
    );
    const findManyArgs = inventoryLogFindManyMock.mock.calls[0][0];
    expect(findManyArgs.where.status).toBeUndefined();
  });

  it("returns pendingTotal in pagination meta so badge counts can be derived from any list response", async () => {
    inventoryLogCountMock
      .mockResolvedValueOnce(7) // total
      .mockResolvedValueOnce(3); // pendingTotal

    const request = new NextRequest("http://localhost/api/inventory/logs");
    const response = await GET(request);
    const body = await response.json();

    expect(body.pagination.pendingTotal).toBe(3);
    expect(body.pagination.total).toBe(7);
  });

  it("maps OUT verification state and latest correction for Stock Log badges", async () => {
    inventoryLogFindManyMock.mockResolvedValue([
      {
        id: "log-out-1",
        productId: "product-1",
        type: "OUT",
        reason: "USAGE",
        quantity: 3,
        note: "Dipakai produksi",
        createdBy: "user-1",
        person: "Rina",
        createdAt: new Date("2026-06-30T03:00:00.000Z"),
        status: "APPROVED",
        approvedBy: "owner-1",
        approverName: "Owner",
        decidedAt: new Date("2026-06-30T03:05:00.000Z"),
        rejectionReason: null,
        verification: { status: "MISMATCH" },
        correctionRequests: [
          {
            id: "correction-1",
            status: "PENDING",
            correctedProductId: "product-1",
            correctedQuantity: 2,
            correctedReason: "USAGE",
            correctedNote: "Qty seharusnya 2",
            requestedBy: "user-1",
            decidedBy: null,
            decidedAt: null,
            rejectionReason: null,
            correctedProduct: {
              id: "product-1",
              name: "Kertas A4",
              sku: "A4-001",
              unit: "rim",
              stock: 12,
              imageUrl: null,
              category: { name: "Kertas", icon: null },
            },
          },
        ],
        product: {
          id: "product-1",
          name: "Kertas A4",
          sku: "A4-001",
          unit: "rim",
          stock: 12,
          imageUrl: null,
          category: { name: "Kertas", icon: null },
        },
      },
    ]);
    inventoryLogCountMock
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);

    const request = new NextRequest("http://localhost/api/inventory/logs?type=OUT");
    const response = await GET(request);
    const body = await response.json();

    expect(body.data[0]).toEqual(
      expect.objectContaining({
        id: "log-out-1",
        verificationState: "CORRECTION_PENDING",
        verification: { status: "MISMATCH" },
        latestCorrection: expect.objectContaining({
          id: "correction-1",
          status: "PENDING",
        }),
      }),
    );
    expect(body.data[0]).not.toHaveProperty("correctionRequests");
  });

  it("does not show Log OUT verification badges for rows outside the verification queue contract", async () => {
    inventoryLogFindManyMock.mockResolvedValue([
      {
        id: "sale-out-1",
        productId: "product-1",
        type: "OUT",
        reason: "SALE",
        quantity: 1,
        note: "Transaksi POS",
        createdBy: "cashier-1",
        person: "Kasir",
        createdAt: new Date("2026-06-30T03:00:00.000Z"),
        status: "APPROVED",
        approvedBy: "owner-1",
        approverName: "Owner",
        decidedAt: new Date("2026-06-30T03:05:00.000Z"),
        rejectionReason: null,
        verification: null,
        correctionRequests: [],
        product: {
          id: "product-1",
          name: "Kertas A4",
          sku: "A4-001",
          unit: "rim",
          stock: 12,
          imageUrl: null,
          category: { name: "Kertas", icon: null },
        },
      },
      {
        id: "pending-usage-1",
        productId: "product-1",
        type: "OUT",
        reason: "USAGE",
        quantity: 2,
        note: "Menunggu approval",
        createdBy: "inventory-1",
        person: "Rina",
        createdAt: new Date("2026-06-30T04:00:00.000Z"),
        status: "PENDING",
        approvedBy: null,
        approverName: null,
        decidedAt: null,
        rejectionReason: null,
        verification: null,
        correctionRequests: [],
        product: {
          id: "product-1",
          name: "Kertas A4",
          sku: "A4-001",
          unit: "rim",
          stock: 12,
          imageUrl: null,
          category: { name: "Kertas", icon: null },
        },
      },
      {
        id: "approved-usage-1",
        productId: "product-1",
        type: "OUT",
        reason: "USAGE",
        quantity: 3,
        note: "Dipakai produksi",
        createdBy: "inventory-1",
        person: "Rina",
        createdAt: new Date("2026-06-30T05:00:00.000Z"),
        status: "APPROVED",
        approvedBy: "owner-1",
        approverName: "Owner",
        decidedAt: new Date("2026-06-30T05:05:00.000Z"),
        rejectionReason: null,
        verification: null,
        correctionRequests: [],
        product: {
          id: "product-1",
          name: "Kertas A4",
          sku: "A4-001",
          unit: "rim",
          stock: 12,
          imageUrl: null,
          category: { name: "Kertas", icon: null },
        },
      },
    ]);
    inventoryLogCountMock
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(1);

    const request = new NextRequest("http://localhost/api/inventory/logs?type=OUT");
    const response = await GET(request);
    const body = await response.json();

    expect(body.data.find((row: { id: string }) => row.id === "sale-out-1")).not.toHaveProperty(
      "verificationState",
    );
    expect(
      body.data.find((row: { id: string }) => row.id === "pending-usage-1"),
    ).not.toHaveProperty("verificationState");
    expect(body.data.find((row: { id: string }) => row.id === "approved-usage-1")).toHaveProperty(
      "verificationState",
      "UNVERIFIED",
    );
  });

  it("attaches the committed inbound receipt bundle to its canonical stock log", async () => {
    inventoryLogFindManyMock.mockResolvedValue([
      {
        id: "log-inbound-1",
        productId: "product-1",
        type: "IN",
        reason: "RESTOCK",
        quantity: 4,
        note: "CV Kertas",
        createdBy: "owner-1",
        person: "Owner",
        createdAt: new Date("2026-07-24T08:00:00.000Z"),
        status: "APPROVED",
        approvedBy: "owner-1",
        approverName: "Owner",
        decidedAt: new Date("2026-07-24T08:00:00.000Z"),
        rejectionReason: null,
        verification: null,
        correctionRequests: [],
        supplier: { id: "supplier-1", name: "CV Kertas" },
        product: {
          id: "product-1",
          name: "Kertas A4",
          sku: "A4-001",
          unit: "dus",
          stock: 14,
          imageUrl: null,
          category: { name: "Kertas", icon: null },
        },
      },
    ]);
    inventoryLogCountMock
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);
    batchOperationItemFindManyMock.mockResolvedValue([
      {
        id: "batch-item-1",
        inventoryLogId: "log-inbound-1",
        batchOperationId: "batch-inbound-1",
        beforeSnapshot: { stock: 10 },
        afterSnapshot: { stock: 14 },
        batchOperation: {
          id: "batch-inbound-1",
          type: "INBOUND_RECEIPT",
          status: "COMMITTED",
          createdBy: "owner-1",
          createdAt: new Date("2026-07-24T08:00:00.000Z"),
          summary: {
            supplierName: "CV Kertas",
            goodsPurchaseNumber: "PB-202607-001",
          },
        },
      },
    ]);

    const response = await GET(
      new NextRequest("http://localhost/api/inventory/logs"),
    );
    const body = await response.json();

    expect(body.data[0].batchItem.batchOperation).toEqual(
      expect.objectContaining({
        id: "batch-inbound-1",
        type: "INBOUND_RECEIPT",
        summary: expect.objectContaining({ supplierName: "CV Kertas" }),
      }),
    );
  });
});
