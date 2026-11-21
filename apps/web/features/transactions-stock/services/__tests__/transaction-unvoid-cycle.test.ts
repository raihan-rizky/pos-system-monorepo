import { describe, expect, it, vi } from "vitest";
import { reverseTransaction } from "../transaction-reversal-service";

describe("siklus void dan pemulihan", () => {
  it("mengizinkan transaksi yang telah dipulihkan untuk di-void lagi", async () => {
    const transaction = {
      id: "tx-1", storeId: "store-1", status: "COMPLETED", customerId: null,
      total: 0, amountPaid: 0, invoiceNumber: "INV-1", paymentMethod: "CASH",
      items: [], payments: [], debtPaymentLogs: [], expenses: [],
      invoiceDateChangeLogs: [], productionActivityLogs: [], printingReceipt: null,
      suratJalan: [],
    };
    const audit = [
      { id: "restore-1", action: "UNVOID", sequence: 2n, createdAt: new Date("2026-11-20T01:00:00Z") },
      { id: "void-1", action: "VOID", sequence: 1n, createdAt: new Date("2026-11-20T02:00:00Z") },
    ];
    const tx = {
      $queryRawUnsafe: vi.fn().mockResolvedValue([{ id: transaction.id }]),
      $queryRaw: vi.fn().mockResolvedValue([]),
      transaction: {
        findFirst: vi.fn().mockResolvedValue(transaction),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      transactionLifecycleAudit: {
        findFirst: vi.fn().mockImplementation(({ where }: any) =>
          Promise.resolve(audit.find((row) => !where.action || row.action === where.action) ?? null)),
        findMany: vi.fn().mockResolvedValue(audit),
        create: vi.fn().mockResolvedValue({ id: "void-2" }),
      },
      inventoryLog: { findMany: vi.fn().mockResolvedValue([]), createMany: vi.fn() },
      product: { findMany: vi.fn().mockResolvedValue([]) },
      productStockGroup: { findMany: vi.fn().mockResolvedValue([]) },
      productStockGroupActivity: { findMany: vi.fn().mockResolvedValue([]) },
      suratJalan: { updateMany: vi.fn() },
    };

    await expect(reverseTransaction(tx as never, {
      transactionId: transaction.id, storeId: transaction.storeId, action: "VOID",
      actor: { id: "owner-1", name: "Owner", role: "OWNER" },
    })).resolves.toBe("APPLIED");
  });
});
