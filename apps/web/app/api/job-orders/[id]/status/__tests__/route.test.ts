import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const dbTransactionMock = vi.hoisted(() => vi.fn());
const transactionFindFirstMock = vi.hoisted(() => vi.fn());
const transactionFindUniqueOrThrowMock = vi.hoisted(() => vi.fn());
const transactionUpdateMock = vi.hoisted(() => vi.fn());
const productionActivityCreateMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    $transaction: dbTransactionMock,
  },
}));

vi.mock("@/lib/logger", () => ({
  getLogger: () => ({
    error: vi.fn(),
  }),
}));

describe("PATCH /api/job-orders/[id]/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockResolvedValue({
      id: "admin-1",
      username: "admin",
      name: "Admin User",
      role: "ADMIN",
      storeId: "store-main",
    });
    handleAuthErrorMock.mockReturnValue(null);
    dbTransactionMock.mockImplementation(async (callback: any) =>
      callback({
        transaction: {
          findFirst: transactionFindFirstMock,
          findUniqueOrThrow: transactionFindUniqueOrThrowMock,
          update: transactionUpdateMock,
        },
        productionActivityLog: {
          create: productionActivityCreateMock,
        },
      }),
    );
    transactionFindFirstMock.mockResolvedValue({
      id: "job-1",
      invoiceNumber: "JOB-20260509-0001",
      customerName: "Budi",
      productionStatus: "PRINTING",
    });
    transactionUpdateMock.mockResolvedValue({
      id: "job-1",
      invoiceNumber: "JOB-20260509-0001",
      productionStatus: "READY_PICKUP",
      items: [],
      salesperson: null,
    });
    transactionFindUniqueOrThrowMock.mockResolvedValue({
      id: "job-1",
      invoiceNumber: "JOB-20260509-0001",
      productionStatus: "PRINTING",
      items: [],
      salesperson: null,
    });
  });

  it("writes a production activity log when status changes", async () => {
    const { PATCH } = await import("../route");
    const response = await PATCH(
      new Request("http://localhost/api/job-orders/job-1/status", {
        method: "PATCH",
        body: JSON.stringify({ productionStatus: "READY_PICKUP" }),
      }),
      { params: Promise.resolve({ id: "job-1" }) },
    );

    expect(response.status).toBe(200);
    expect(requirePermissionMock).toHaveBeenCalledWith("production", "update");
    expect(transactionUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-1" },
        data: { productionStatus: "READY_PICKUP" },
      }),
    );
    expect(productionActivityCreateMock).toHaveBeenCalledWith({
      data: {
        transactionId: "job-1",
        storeId: "store-main",
        invoiceNumber: "JOB-20260509-0001",
        customerName: "Budi",
        fromStatus: "PRINTING",
        toStatus: "READY_PICKUP",
        actorId: "admin-1",
        actorName: "Admin User",
        actorRole: "ADMIN",
      },
    });
  });

  it("does not write a duplicate activity log for an unchanged status", async () => {
    transactionFindFirstMock.mockResolvedValue({
      id: "job-1",
      invoiceNumber: "JOB-20260509-0001",
      customerName: "Budi",
      productionStatus: "READY_PICKUP",
    });

    const { PATCH } = await import("../route");
    const response = await PATCH(
      new Request("http://localhost/api/job-orders/job-1/status", {
        method: "PATCH",
        body: JSON.stringify({ productionStatus: "READY_PICKUP" }),
      }),
      { params: Promise.resolve({ id: "job-1" }) },
    );

    expect(response.status).toBe(200);
    expect(transactionUpdateMock).not.toHaveBeenCalled();
    expect(productionActivityCreateMock).not.toHaveBeenCalled();
    expect(transactionFindUniqueOrThrowMock).toHaveBeenCalled();
  });
});
