import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const batchOperationFindUniqueMock = vi.hoisted(() => vi.fn());
const batchOperationUpdateMock = vi.hoisted(() => vi.fn());
const inventoryLogFindManyMock = vi.hoisted(() => vi.fn());
const inventoryLogUpdateManyMock = vi.hoisted(() => vi.fn());
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
  },
  Prisma: {},
}));

function call(body: unknown) {
  return POST(
    new Request("http://localhost/api/inventory/bulk/batch-1/reject-all", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
    { params: Promise.resolve({ batchId: "batch-1" }) },
  );
}

describe("POST /api/inventory/bulk/[batchId]/reject-all", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({ id: "owner-1", name: "Owner", role: "OWNER" });
    batchOperationFindUniqueMock.mockResolvedValue({
      id: "batch-1",
      type: "BULK_STOCK_ADJUSTMENT",
      status: "PENDING",
      summary: { productName: "Bundle kain" },
      items: [
        { id: "item-1", inventoryLogId: "log-1" },
        { id: "item-2", inventoryLogId: "log-2" },
        { id: "item-3", inventoryLogId: "log-3" },
      ],
    });
    inventoryLogUpdateManyMock.mockResolvedValue({ count: 2 });
    inventoryLogFindManyMock.mockResolvedValue([
      { id: "log-1", status: "REJECTED" },
      { id: "log-2", status: "REJECTED" },
      { id: "log-3", status: "APPROVED" },
    ]);
    batchOperationUpdateMock.mockResolvedValue({ id: "batch-1", status: "COMMITTED" });
    dbTransactionMock.mockImplementation(async (callback) =>
      callback({
        batchOperation: {
          findUnique: batchOperationFindUniqueMock,
          update: batchOperationUpdateMock,
        },
        inventoryLog: {
          findMany: inventoryLogFindManyMock,
          updateMany: inventoryLogUpdateManyMock,
        },
      }),
    );
  });

  it("rejects pending logs in one bulk update and updates bundle status once", async () => {
    const response = await call({ reason: "Stok tidak valid" });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(inventoryLogUpdateManyMock).toHaveBeenCalledTimes(1);
    expect(inventoryLogUpdateManyMock).toHaveBeenCalledWith({
      where: {
        id: { in: ["log-1", "log-2", "log-3"] },
        status: "PENDING",
      },
      data: expect.objectContaining({
        status: "REJECTED",
        approvedBy: "owner-1",
        approverName: "Owner",
        rejectionReason: "Stok tidak valid",
      }),
    });
    expect(batchOperationUpdateMock).toHaveBeenCalledTimes(1);
    expect(body).toMatchObject({
      rejectedCount: 2,
      batchStatus: "COMMITTED",
      batchSummary: {
        totalCount: 3,
        pendingCount: 0,
        approvedCount: 1,
        rejectedCount: 2,
      },
    });
  });
});
