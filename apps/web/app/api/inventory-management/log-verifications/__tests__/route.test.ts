import { beforeEach, describe, expect, it, vi } from "vitest";
import * as routeHandlers from "../route";

const { POST } = routeHandlers;

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const inventoryLogFindFirstMock = vi.hoisted(() => vi.fn());
const inventoryLogFindManyMock = vi.hoisted(() => vi.fn());
const inventoryLogCountMock = vi.hoisted(() => vi.fn());
const inventoryLogVerificationUpsertMock = vi.hoisted(() => vi.fn());
const inventoryTaskFindUniqueMock = vi.hoisted(() => vi.fn());
const inventoryDaySessionFindUniqueMock = vi.hoisted(() => vi.fn());
const productFindFirstMock = vi.hoisted(() => vi.fn());
const correctionFindFirstMock = vi.hoisted(() => vi.fn());
const correctionCreateMock = vi.hoisted(() => vi.fn());
const correctionUpdateMock = vi.hoisted(() => vi.fn());
const correctionMovementCreateMock = vi.hoisted(() => vi.fn());
const inventoryLogCreateMock = vi.hoisted(() => vi.fn());
const transactionMock = vi.hoisted(() => vi.fn());
const applyProductStockDeltaMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@/features/product-stock-groups/stock-mutations", () => ({
  applyProductStockDelta: applyProductStockDeltaMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    inventoryLog: {
      findFirst: inventoryLogFindFirstMock,
      findMany: inventoryLogFindManyMock,
      count: inventoryLogCountMock,
      create: inventoryLogCreateMock,
    },
    inventoryLogVerification: { upsert: inventoryLogVerificationUpsertMock },
    inventoryTask: { findUnique: inventoryTaskFindUniqueMock },
    inventoryDaySession: { findUnique: inventoryDaySessionFindUniqueMock },
    product: { findFirst: productFindFirstMock },
    inventoryLogCorrectionRequest: {
      findFirst: correctionFindFirstMock,
      create: correctionCreateMock,
      update: correctionUpdateMock,
    },
    inventoryLogCorrectionMovement: { create: correctionMovementCreateMock },
    $transaction: transactionMock,
  },
}));

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/inventory-management/log-verifications", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/inventory-management/log-verifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({
      id: "inventory-1",
      role: "INVENTORY",
      storeId: "store-main",
    });
    inventoryLogFindFirstMock.mockResolvedValue({
      id: "log-1",
      type: "OUT",
      reason: "USAGE",
      status: "APPROVED",
      createdAt: new Date("2026-06-30T02:00:00.000Z"),
      product: { storeId: "store-main" },
    });
    inventoryTaskFindUniqueMock.mockResolvedValue(null);
    inventoryDaySessionFindUniqueMock.mockResolvedValue(null);
    correctionFindFirstMock.mockResolvedValue(null);
    transactionMock.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback({
        inventoryLogCorrectionRequest: {
          findFirst: correctionFindFirstMock,
          update: correctionUpdateMock,
        },
        inventoryLog: { create: inventoryLogCreateMock },
        inventoryLogCorrectionMovement: {
          create: correctionMovementCreateMock,
        },
      }),
    );
    inventoryLogVerificationUpsertMock.mockResolvedValue({
      id: "verification-1",
      inventoryLogId: "log-1",
      status: "VERIFIED",
    });
  });

  it("requires granular OUT log permission and verifies approved internal stock-out logs", async () => {
    const response = await post({
      inventoryLogId: "log-1",
      status: "VERIFIED",
      note: "Barang benar dipakai produksi",
    });

    expect(response.status).toBe(200);
    expect(requirePermissionMock).toHaveBeenCalledWith(
      "inventory.out_log.verify",
      "update",
    );
    expect(inventoryLogFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "log-1",
          type: "OUT",
          status: "APPROVED",
          product: { storeId: "store-main" },
        }),
      }),
    );
    expect(inventoryLogVerificationUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { inventoryLogId: "log-1" },
        create: expect.objectContaining({
          inventoryLogId: "log-1",
          storeId: "store-main",
          status: "VERIFIED",
          note: "Barang benar dipakai produksi",
          verifiedBy: "inventory-1",
        }),
        update: expect.objectContaining({
          status: "VERIFIED",
          note: "Barang benar dipakai produksi",
          verifiedBy: "inventory-1",
        }),
      }),
    );
  });

  it("rejects approved OUT logs that are not internal/manual stock-out tasks", async () => {
    inventoryLogFindFirstMock.mockResolvedValue({
      id: "log-1",
      type: "OUT",
      reason: "SALE",
      status: "APPROVED",
      product: { storeId: "store-main" },
    });

    const response = await post({
      inventoryLogId: "log-1",
      status: "VERIFIED",
    });

    expect(response.status).toBe(422);
    expect(inventoryLogVerificationUpsertMock).not.toHaveBeenCalled();
  });

  it("records mismatch decisions for stock-out logs that are not real", async () => {
    inventoryLogVerificationUpsertMock.mockResolvedValue({
      id: "verification-1",
      inventoryLogId: "log-1",
      status: "MISMATCH",
    });

    const response = await post({
      inventoryLogId: "log-1",
      status: "MISMATCH",
      note: "Barang masih ada di gudang",
    });

    expect(response.status).toBe(200);
    expect(inventoryLogVerificationUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ status: "MISMATCH" }),
        update: expect.objectContaining({ status: "MISMATCH" }),
      }),
    );
  });

  it("rejects users without a store scope", async () => {
    requirePermissionMock.mockResolvedValue({
      id: "inventory-1",
      role: "INVENTORY",
      storeId: null,
    });

    const response = await post({
      inventoryLogId: "log-1",
      status: "VERIFIED",
    });

    expect(response.status).toBe(403);
    expect(inventoryLogFindFirstMock).not.toHaveBeenCalled();
    expect(inventoryLogVerificationUpsertMock).not.toHaveBeenCalled();
  });

  it("locks verification after daily matching has been submitted", async () => {
    inventoryTaskFindUniqueMock.mockResolvedValue({ status: "SUBMITTED" });

    const response = await post({
      inventoryLogId: "log-1",
      status: "MISMATCH",
    });

    expect(response.status).toBe(409);
    expect(inventoryLogVerificationUpsertMock).not.toHaveBeenCalled();
  });

  it("does not allow verification status changes while a correction is pending", async () => {
    correctionFindFirstMock.mockResolvedValue({
      id: "correction-1",
      status: "PENDING",
    });

    const response = await post({
      inventoryLogId: "log-1",
      status: "VERIFIED",
    });

    expect(response.status).toBe(409);
    expect(inventoryLogVerificationUpsertMock).not.toHaveBeenCalled();
  });

  it("creates a pending correction without changing stock", async () => {
    inventoryLogFindFirstMock.mockResolvedValue({
      id: "log-1",
      productId: "product-wrong",
      quantity: 10,
      reason: "USAGE",
      createdAt: new Date("2026-06-30T02:00:00.000Z"),
      verification: { status: "MISMATCH" },
    });
    productFindFirstMock.mockResolvedValue({ id: "product-right" });
    correctionCreateMock.mockResolvedValue({
      id: "correction-1",
      status: "PENDING",
    });

    const response = await post({
      action: "CREATE_CORRECTION",
      inventoryLogId: "log-1",
      correctedProductId: "product-right",
      correctedQuantity: 4,
      correctedReason: "USAGE",
      correctedNote: "Produk dan jumlah yang benar",
    });

    expect(response.status).toBe(201);
    expect(correctionCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        storeId: "store-main",
        inventoryLogId: "log-1",
        correctedProductId: "product-right",
        correctedQuantity: 4,
        correctedReason: "USAGE",
        correctedNote: "Produk dan jumlah yang benar",
        requestedBy: "inventory-1",
        status: "PENDING",
      }),
    });
  });

  it("approves a correction atomically with reversal and replacement movements", async () => {
    requirePermissionMock.mockResolvedValue({
      id: "owner-2",
      name: "Owner Dua",
      role: "OWNER",
      storeId: "store-main",
    });
    correctionFindFirstMock.mockResolvedValue({
      id: "correction-1",
      storeId: "store-main",
      inventoryLogId: "log-1",
      correctedProductId: "product-right",
      correctedQuantity: 4,
      correctedReason: "USAGE",
      correctedNote: "Produk dan jumlah yang benar",
      status: "PENDING",
      requestedBy: "inventory-1",
      inventoryLog: {
        id: "log-1",
        productId: "product-wrong",
        quantity: 10,
      },
    });
    inventoryLogCreateMock
      .mockResolvedValueOnce({ id: "adjustment-reversal" })
      .mockResolvedValueOnce({ id: "adjustment-replacement" });
    correctionUpdateMock.mockResolvedValue({
      id: "correction-1",
      status: "APPROVED",
    });

    const response = await post({
      action: "APPROVE_CORRECTION",
      correctionRequestId: "correction-1",
    });

    expect(response.status).toBe(200);
    expect(requirePermissionMock).toHaveBeenCalledWith("inventory.approve", "update");
    expect(applyProductStockDeltaMock).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      { storeId: "store-main", productId: "product-wrong", delta: 10 },
    );
    expect(applyProductStockDeltaMock).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      { storeId: "store-main", productId: "product-right", delta: -4 },
    );
    expect(correctionUpdateMock).toHaveBeenCalledWith({
      where: { id: "correction-1" },
      data: expect.objectContaining({
        status: "APPROVED",
        decidedBy: "owner-2",
      }),
    });
  });

  it("rejects self-approval of an OUT log correction", async () => {
    requirePermissionMock.mockResolvedValue({
      id: "owner-1",
      name: "Owner Satu",
      role: "OWNER",
      storeId: "store-main",
    });
    correctionFindFirstMock.mockResolvedValue({
      id: "correction-1",
      storeId: "store-main",
      inventoryLogId: "log-1",
      correctedProductId: "product-1",
      correctedQuantity: 8,
      correctedReason: "USAGE",
      correctedNote: "Jumlah benar",
      status: "PENDING",
      requestedBy: "owner-1",
      inventoryLog: {
        id: "log-1",
        productId: "product-1",
        quantity: 10,
      },
    });

    const response = await post({
      action: "APPROVE_CORRECTION",
      correctionRequestId: "correction-1",
    });

    expect(response.status).toBe(403);
    expect(applyProductStockDeltaMock).not.toHaveBeenCalled();
  });

  it("rejects a correction with an audit reason and no stock mutation", async () => {
    requirePermissionMock.mockResolvedValue({
      id: "owner-2",
      name: "Owner Dua",
      role: "OWNER",
      storeId: "store-main",
    });
    correctionFindFirstMock.mockResolvedValue({
      id: "correction-1",
      status: "PENDING",
      requestedBy: "inventory-1",
    });
    correctionUpdateMock.mockResolvedValue({
      id: "correction-1",
      status: "REJECTED",
    });

    const response = await post({
      action: "REJECT_CORRECTION",
      correctionRequestId: "correction-1",
      reason: "Jumlah koreksi belum didukung bukti",
    });

    expect(response.status).toBe(200);
    expect(requirePermissionMock).toHaveBeenCalledWith("inventory.approve", "update");
    expect(correctionUpdateMock).toHaveBeenCalledWith({
      where: { id: "correction-1" },
      data: expect.objectContaining({
        status: "REJECTED",
        decidedBy: "owner-2",
        rejectionReason: "Jumlah koreksi belum didukung bukti",
      }),
    });
    expect(applyProductStockDeltaMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/inventory-management/log-verifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({
      id: "inventory-1",
      role: "INVENTORY",
      storeId: "store-main",
    });
    inventoryLogCountMock.mockResolvedValue(1);
    inventoryLogFindManyMock.mockResolvedValue([
      {
        id: "log-1",
        productId: "product-1",
        type: "OUT",
        quantity: 4,
        reason: "USAGE",
        note: "Dipakai produksi",
        person: "Rina",
        createdBy: "inventory-1",
        createdAt: new Date("2026-06-30T02:00:00.000Z"),
        status: "APPROVED",
        product: {
          id: "product-1",
          name: "Kertas A4",
          sku: "A4-001",
          unit: "rim",
          stock: 12,
          imageUrl: null,
          category: { name: "Kertas", icon: null },
        },
        verification: {
          id: "verification-1",
          status: "MISMATCH",
          note: null,
          verifiedBy: "inventory-1",
          verifiedAt: new Date("2026-06-30T03:00:00.000Z"),
          updatedAt: new Date("2026-06-30T03:00:00.000Z"),
        },
        correctionRequests: [
          {
            id: "correction-1",
            status: "PENDING",
            correctedProductId: "product-1",
            correctedQuantity: 3,
            correctedReason: "USAGE",
            correctedNote: "Jumlah sebenarnya tiga",
            requestedBy: "inventory-1",
            createdAt: new Date("2026-06-30T03:05:00.000Z"),
          },
        ],
      },
    ]);
  });

  it("returns today's eligible OUT logs with their derived correction state", async () => {
    const GET = (
      routeHandlers as typeof routeHandlers & {
        GET?: (request: Request) => Promise<Response>;
      }
    ).GET;
    const response = await GET?.(
      new Request(
        "http://localhost/api/inventory-management/log-verifications?dateKey=2026-06-30",
      ),
    );

    expect(response?.status).toBe(200);
    const body = await response?.json();
    expect(requirePermissionMock).toHaveBeenCalledWith("inventory", "read");
    expect(body.data.items[0]).toMatchObject({
      id: "log-1",
      verificationState: "CORRECTION_PENDING",
    });
  });
});
