import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const dbTransactionMock = vi.hoisted(() => vi.fn());
const transactionFindFirstMock = vi.hoisted(() => vi.fn());
const transactionFindManyMock = vi.hoisted(() => vi.fn());
const transactionUpdateMock = vi.hoisted(() => vi.fn());
const activityUpdateManyMock = vi.hoisted(() => vi.fn());
const inventoryLogFindManyMock = vi.hoisted(() => vi.fn());
const inventoryLogUpdateMock = vi.hoisted(() => vi.fn());
const changeLogCreateMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    $transaction: dbTransactionMock,
  },
}));

describe("PATCH /api/transactions/[id]/invoice-date", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockResolvedValue({
      id: "owner-1",
      role: "OWNER",
      storeId: "store-main",
      name: "Owner One",
    });
    handleAuthErrorMock.mockReturnValue(null);
    transactionFindFirstMock.mockResolvedValue({
      id: "tx-1",
      storeId: "store-main",
      status: "COMPLETED",
      invoiceNumber: "INV-20260520-0007",
      draftNumber: null,
      invoiceDate: new Date("2026-05-20T03:00:00.000Z"),
    });
    transactionFindManyMock.mockResolvedValue([
      { invoiceNumber: "INV-20260702-0001", draftNumber: null },
      { invoiceNumber: "INV-20260702-0002", draftNumber: null },
    ]);
    transactionUpdateMock.mockImplementation(async ({ data }: any) => ({
      id: "tx-1",
      status: "COMPLETED",
      invoiceNumber: data.invoiceNumber,
      draftNumber: null,
      invoiceDate: data.invoiceDate,
      createdAt: new Date("2026-05-20T04:00:00.000Z"),
    }));
    activityUpdateManyMock.mockResolvedValue({ count: 2 });
    inventoryLogFindManyMock.mockResolvedValue([
      { id: "log-1", note: "Approve Penjualan INV-20260520-0007" },
      { id: "log-2", note: "Catatan manual INV-20260520-0007" },
    ]);
    inventoryLogUpdateMock.mockResolvedValue({});
    changeLogCreateMock.mockResolvedValue({});
    dbTransactionMock.mockImplementation(async (callback: any) =>
      callback({
        transaction: {
          findFirst: transactionFindFirstMock,
          findMany: transactionFindManyMock,
          update: transactionUpdateMock,
        },
        productionActivityLog: { updateMany: activityUpdateManyMock },
        inventoryLog: {
          findMany: inventoryLogFindManyMock,
          update: inventoryLogUpdateMock,
        },
        invoiceDateChangeLog: { create: changeLogCreateMock },
      }),
    );
  });

  it("regenerates invoice number, updates safe linked records, and writes audit log", async () => {
    const { PATCH } = await import("../route");

    const response = await PATCH(
      new Request("http://localhost/api/transactions/tx-1/invoice-date", {
        method: "PATCH",
        body: JSON.stringify({
          invoiceDate: "2026-07-02",
          regenerateNumber: true,
          reason: "Menyesuaikan tanggal invoice final",
        }),
      }),
      { params: Promise.resolve({ id: "tx-1" }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.invoiceNumber).toBe("INV-20260702-0007");
    expect(body.invoiceDate).toBe("2026-07-02T03:00:00.000Z");
    expect(transactionFindManyMock).toHaveBeenCalledWith({
      where: {
        storeId: "store-main",
        invoiceNumber: { startsWith: "INV-20260702-" },
        id: { not: "tx-1" },
      },
      select: { invoiceNumber: true, draftNumber: true },
    });
    expect(activityUpdateManyMock).toHaveBeenCalledWith({
      where: { storeId: "store-main", transactionId: "tx-1" },
      data: { invoiceNumber: "INV-20260702-0007" },
    });
    expect(inventoryLogUpdateMock).toHaveBeenCalledTimes(1);
    expect(inventoryLogUpdateMock).toHaveBeenCalledWith({
      where: { id: "log-1" },
      data: { note: "Approve Penjualan INV-20260702-0007" },
    });
    expect(changeLogCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        transactionId: "tx-1",
        storeId: "store-main",
        oldDocumentNumber: "INV-20260520-0007",
        newDocumentNumber: "INV-20260702-0007",
        oldInvoiceDate: new Date("2026-05-20T03:00:00.000Z"),
        newInvoiceDate: new Date("2026-07-02T03:00:00.000Z"),
        reason: "Menyesuaikan tanggal invoice final",
        actorId: "owner-1",
        actorName: "Owner One",
        actorRole: "OWNER",
      }),
    });
  });
});
