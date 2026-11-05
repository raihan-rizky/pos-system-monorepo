import { beforeEach, describe, expect, it, vi } from "vitest";
import { reverseTransaction, TransactionReversalConflictError } from "../transaction-reversal-service";

const transaction = {
  id: "tx-1",
  storeId: "store-1",
  status: "COMPLETED",
  stockDeductionSource: "TRANSACTION",
  stockManagedBySuratJalan: false,
  invoiceNumber: "INV-001",
  paymentMethod: "TEMPO",
  total: 100,
  amountPaid: 75,
  customerId: "customer-1",
  items: [
    {
      id: "item-1",
      productId: "finished-paper",
      productName: "Poster",
      quantity: 2,
      unitCost: 4,
      rawMaterialProductId: "raw-paper",
      rawMaterialQuantity: 3,
    },
  ],
  payments: [{ method: "CASH", amount: 75 }],
  debtPaymentLogs: [],
  suratJalan: [],
};

const journal = [
  {
    id: "sale-finished",
    productId: "finished-paper",
    type: "OUT",
    reason: "SALE",
    status: "APPROVED",
    quantity: 2,
    stockGroupIdSnapshot: null,
    unitMultiplierSnapshot: 1,
    stockBaseDelta: -2,
    transactionId: "tx-1",
    sourceTransactionRef: "tx-1",
    suratJalanId: null,
  },
  {
    id: "partial-return-finished",
    productId: "finished-paper",
    type: "IN",
    reason: "SALE_RETURN",
    status: "APPROVED",
    quantity: 1,
    stockGroupIdSnapshot: null,
    unitMultiplierSnapshot: 1,
    stockBaseDelta: 1,
    transactionId: "tx-1",
    sourceTransactionRef: "tx-1",
    suratJalanId: null,
  },
  {
    id: "sale-paper",
    productId: "raw-paper",
    type: "OUT",
    reason: "SALE",
    status: "APPROVED",
    quantity: 3,
    stockGroupIdSnapshot: "paper-group",
    unitMultiplierSnapshot: 4,
    stockBaseDelta: -12,
    transactionId: "tx-1",
    sourceTransactionRef: "tx-1",
    suratJalanId: null,
  },
];

function makeLegacyInvoiceLogs() {
  return [
    {
      id: "legacy-sale-finished",
      productId: "finished-paper",
      type: "OUT",
      reason: "SALE",
      status: "APPROVED",
      quantity: 2,
      note: "Penjualan INV-001",
      transactionId: null,
      sourceTransactionRef: null,
      suratJalanId: null,
      stockGroupIdSnapshot: null,
      unitMultiplierSnapshot: null,
      stockBaseDelta: null,
      unitCost: 4,
    },
    {
      id: "legacy-usage-paper",
      productId: "raw-paper",
      type: "OUT",
      reason: "USAGE",
      status: "APPROVED",
      quantity: 3,
      note: "Bahan layanan cetak Poster - INV-001",
      transactionId: null,
      sourceTransactionRef: null,
      suratJalanId: null,
      stockGroupIdSnapshot: null,
      unitMultiplierSnapshot: null,
      stockBaseDelta: null,
      unitCost: 2,
    },
  ];
}

function makeLegacyShipmentHistory(logQuantity = 4) {
  return {
    transaction: {
      ...transaction,
      stockDeductionSource: "SURAT_JALAN",
      items: [{ ...transaction.items[0], quantity: 10, rawMaterialProductId: null, rawMaterialQuantity: null }],
      suratJalan: [{
        id: "sj-legacy-1",
        number: "SJ-LEGACY-001",
        status: "CONFIRMED",
        items: [{ id: "sj-item-1", productId: "finished-paper", quantity: 4 }],
      }],
    },
    logs: [
      {
        id: "legacy-invoice-sale",
        productId: "finished-paper",
        type: "OUT",
        reason: "SALE",
        status: "APPROVED",
        quantity: 10,
        note: "Penjualan INV-001",
        transactionId: null,
        sourceTransactionRef: null,
        suratJalanId: null,
        stockGroupIdSnapshot: null,
        unitMultiplierSnapshot: null,
        stockBaseDelta: null,
      },
      {
        id: "legacy-invoice-reversal",
        productId: "finished-paper",
        type: "IN",
        reason: "SALE_RETURN",
        status: "APPROVED",
        quantity: 10,
        note: "Reversal invoice tx-1 untuk Surat Jalan SJ-LEGACY-001",
        transactionId: "tx-1",
        sourceTransactionRef: null,
        suratJalanId: null,
        stockGroupIdSnapshot: null,
        unitMultiplierSnapshot: null,
        stockBaseDelta: null,
      },
      {
        id: "legacy-shipment-sale",
        productId: "finished-paper",
        type: "OUT",
        reason: "SALE",
        status: "APPROVED",
        quantity: logQuantity,
        note: "Surat Jalan SJ-LEGACY-001 untuk invoice tx-1",
        transactionId: "tx-1",
        sourceTransactionRef: null,
        suratJalanId: "sj-legacy-1",
        stockGroupIdSnapshot: null,
        unitMultiplierSnapshot: null,
        stockBaseDelta: null,
      },
    ],
  };
}

function makeTx(options?: {
  current?: any;
  inventoryLogs?: any[];
  existingVoidAudit?: boolean;
}) {
  const current = options?.current ?? transaction;
  return {
    $queryRawUnsafe: vi.fn().mockResolvedValue([{ id: current.id }]),
    $queryRaw: vi.fn().mockImplementation(async (_strings: TemplateStringsArray, id: string) => [{ id }]),
    transaction: {
      findFirst: vi.fn().mockResolvedValue(current),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    inventoryLog: {
      findMany: vi.fn().mockResolvedValue(options?.inventoryLogs ?? journal),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    transactionItem: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    suratJalanItem: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    suratJalan: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    printingReceipt: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    transactionLifecycleAudit: {
      findFirst: vi
        .fn()
        .mockResolvedValue(options?.existingVoidAudit ? { id: "void-audit" } : null),
      create: vi.fn().mockResolvedValue({ id: "audit-1" }),
    },
    product: {
      findMany: vi.fn().mockImplementation(({ where }: any) =>
        Promise.resolve(
          where.id.in.map((id: string) => ({
            id,
            stockGroupId: null,
            unitMultiplierToBase: 1,
            conversionNeedsReview: false,
          })),
        ),
      ),
      findFirst: vi.fn().mockResolvedValue({ stock: 2, stockGroupId: null }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    productStockGroupActivity: { findMany: vi.fn().mockResolvedValue([]) },
    productStockGroup: {
      findFirst: vi.fn().mockResolvedValue({ baseStock: 12 }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    customer: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

describe("reverseTransaction", () => {
  it("locks all snapshot groups then sorted products before any stock return", async () => {
    const tx = makeTx();
    await reverseTransaction(tx as never, { transactionId: transaction.id, storeId: "store-1", actor: { id: "owner-1", name: "Owner", role: "OWNER" }, action: "VOID" });
    expect(tx.$queryRaw.mock.calls.map(([strings, id]) => [strings.join(""), id])).toEqual([
      [expect.stringContaining("pos_product_stock_groups"), "paper-group"],
      [expect.stringContaining("pos_products"), "finished-paper"],
      [expect.stringContaining("pos_products"), "raw-paper"],
    ]);
    const lastLock = tx.$queryRaw.mock.invocationCallOrder.at(-1)!;
    expect(lastLock).toBeLessThan(tx.product.updateMany.mock.invocationCallOrder[0]);
    expect(lastLock).toBeLessThan(tx.productStockGroup.updateMany.mock.invocationCallOrder[0]);
  });

  it("rejects missing stock lock targets before returning any stock", async () => {
    const tx = makeTx();
    tx.$queryRaw.mockResolvedValueOnce([]);
    await expect(reverseTransaction(tx as never, { transactionId: transaction.id, storeId: "store-1", actor: { id: "owner-1", name: "Owner", role: "OWNER" }, action: "VOID" })).rejects.toBeInstanceOf(TransactionReversalConflictError);
    expect(tx.product.updateMany).not.toHaveBeenCalled();
    expect(tx.productStockGroup.updateMany).not.toHaveBeenCalled();
  });

  it("locks the customer before the invoice to serialize reversal with debt collections", async () => {
    const tx = makeTx();
    await reverseTransaction(tx as never, { transactionId: transaction.id, storeId: "store-1", actor: { id: "owner-1", name: "Owner", role: "OWNER" }, action: "VOID" });
    expect(tx.$queryRawUnsafe.mock.calls[0][0]).toContain("pos_customers");
    expect(tx.$queryRawUnsafe.mock.calls[1][0]).toContain("pos_transactions");
  });
  it("restores invoice-only legacy deductions despite the SURAT_JALAN migration default", async () => {
    const tx = makeTx({ current: { ...transaction, stockDeductionSource: "SURAT_JALAN" }, inventoryLogs: makeLegacyInvoiceLogs() });
    await reverseTransaction(tx as never, { transactionId: transaction.id, storeId: "store-1", actor: { id: "owner-1", name: "Owner", role: "OWNER" }, action: "VOID" });
    expect(tx.product.updateMany).toHaveBeenCalledTimes(2);
    expect(tx.inventoryLog.updateMany).toHaveBeenCalledTimes(2);
  });
  beforeEach(() => vi.clearAllMocks());

  it("returns only stock still deducted, including raw materials, and snapshots the reversal", async () => {
    const tx = makeTx();

    await expect(
      reverseTransaction(tx as never, {
        storeId: "store-1",
        transactionId: "tx-1",
        action: "VOID",
        actor: { id: "owner-1", name: "Owner One", role: "OWNER" },
      }),
    ).resolves.toBe("APPLIED");

    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: { id: "finished-paper", storeId: "store-1", stockGroupId: null },
      data: { stock: { increment: 1 } },
    });
    expect(tx.productStockGroup.updateMany).toHaveBeenCalledWith({
      where: { id: "paper-group", storeId: "store-1" },
      data: { baseStock: { increment: 12 } },
    });
    expect(tx.inventoryLog.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          productId: "finished-paper",
          stockBaseDelta: 1,
          sourceTransactionRef: "tx-1",
        }),
        expect.objectContaining({
          productId: "raw-paper",
          stockGroupIdSnapshot: "paper-group",
          stockBaseDelta: 12,
          sourceTransactionRef: "tx-1",
        }),
      ]),
    });
    expect(tx.customer.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: "customer-1",
        storeId: "store-1",
        totalDebt: { gte: 25 },
      }),
      data: expect.objectContaining({ totalDebt: { decrement: 25 } }),
    });
    expect(tx.transaction.updateMany).toHaveBeenCalledWith({
      where: { id: "tx-1", storeId: "store-1", status: "COMPLETED" },
      data: { status: "VOIDED" },
    });
    expect(tx.transactionLifecycleAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "VOID",
        transactionId: "tx-1",
        invoiceNumber: "INV-001",
        actorId: "owner-1",
        actorRole: "OWNER",
        snapshot: expect.objectContaining({
          previousStatus: "COMPLETED",
          stockReturns: expect.any(Array),
        }),
      }),
    });
  });

  it("does not mutate stock or debt when a void already has an audit", async () => {
    const voidedTransaction = { ...transaction, status: "VOIDED" };
    const tx = makeTx({ current: voidedTransaction, existingVoidAudit: true });

    await expect(
      reverseTransaction(tx as never, {
        storeId: "store-1",
        transactionId: "tx-1",
        action: "VOID",
        actor: { id: "owner-1", name: "Owner One", role: "OWNER" },
      }),
    ).resolves.toBe("ALREADY_VOIDED");

    expect(tx.product.updateMany).not.toHaveBeenCalled();
    expect(tx.productStockGroup.updateMany).not.toHaveBeenCalled();
    expect(tx.customer.updateMany).not.toHaveBeenCalled();
    expect(tx.transactionLifecycleAudit.create).not.toHaveBeenCalled();
  });

  it("rejects final stock history without proof before writing anything", async () => {
    const tx = makeTx({ inventoryLogs: [] });

    await expect(
      reverseTransaction(tx as never, {
        storeId: "store-1",
        transactionId: "tx-1",
        action: "VOID",
        actor: { id: "owner-1", name: "Owner One", role: "OWNER" },
      }),
    ).rejects.toMatchObject({ code: "STOCK_HISTORY_REVIEW_REQUIRED" });

    expect(tx.product.updateMany).not.toHaveBeenCalled();
    expect(tx.transaction.updateMany).not.toHaveBeenCalled();
    expect(tx.transactionLifecycleAudit.create).not.toHaveBeenCalled();
  });

  it("restores legacy invoice-linked product and raw-material logs and links them before deletion", async () => {
    const tx = makeTx({ inventoryLogs: makeLegacyInvoiceLogs() });

    await expect(
      reverseTransaction(tx as never, {
        storeId: "store-1",
        transactionId: "tx-1",
        action: "DELETE",
        actor: { id: "owner-1", name: "Owner One", role: "OWNER" },
      }),
    ).resolves.toBe("APPLIED");

    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: { id: "finished-paper", storeId: "store-1", stockGroupId: null },
      data: { stock: { increment: 2 } },
    });
    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: { id: "raw-paper", storeId: "store-1", stockGroupId: null },
      data: { stock: { increment: 3 } },
    });
    expect(tx.inventoryLog.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: "legacy-sale-finished", transactionId: null, sourceTransactionRef: null },
      data: {
        sourceTransactionRef: "tx-1",
        stockGroupIdSnapshot: null,
        unitMultiplierSnapshot: 1,
        stockBaseDelta: -2,
      },
    });
    expect(tx.inventoryLog.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: "legacy-usage-paper", transactionId: null, sourceTransactionRef: null },
      data: {
        sourceTransactionRef: "tx-1",
        stockGroupIdSnapshot: null,
        unitMultiplierSnapshot: 1,
        stockBaseDelta: -3,
      },
    });
  });

  it("does not restore legacy stock again when deleting after a legacy void", async () => {
    const legacyLogs = makeLegacyInvoiceLogs();
    const voidTx = makeTx({ inventoryLogs: legacyLogs });

    await expect(
      reverseTransaction(voidTx as never, {
        storeId: "store-1",
        transactionId: "tx-1",
        action: "VOID",
        actor: { id: "owner-1", name: "Owner One", role: "OWNER" },
      }),
    ).resolves.toBe("APPLIED");
    expect(voidTx.product.updateMany).toHaveBeenCalledTimes(2);

    const upgradedLegacyLogs = legacyLogs.map((row) => ({
      ...row,
      sourceTransactionRef: "tx-1",
      stockGroupIdSnapshot: null,
      unitMultiplierSnapshot: 1,
      stockBaseDelta: -row.quantity,
    }));
    const returnLogs = legacyLogs.map((row) => ({
      ...row,
      id: `return-${row.id}`,
      type: "IN",
      reason: "SALE_RETURN",
      quantity: row.quantity,
      note: "Void transaction INV-001",
      transactionId: "tx-1",
      sourceTransactionRef: "tx-1",
      stockBaseDelta: row.quantity,
    }));
    const deleteTx = makeTx({
      current: { ...transaction, status: "VOIDED" },
      inventoryLogs: [...upgradedLegacyLogs, ...returnLogs] as any,
    });

    await expect(
      reverseTransaction(deleteTx as never, {
        storeId: "store-1",
        transactionId: "tx-1",
        action: "DELETE",
        actor: { id: "owner-1", name: "Owner One", role: "OWNER" },
      }),
    ).resolves.toBe("APPLIED");

    expect(deleteTx.product.updateMany).not.toHaveBeenCalled();
    expect(deleteTx.productStockGroup.updateMany).not.toHaveBeenCalled();
    expect(deleteTx.inventoryLog.createMany).not.toHaveBeenCalled();
    expect(deleteTx.transaction.deleteMany).toHaveBeenCalledTimes(1);
  });

  it.each(["VOID", "DELETE"] as const)("handles %s with legacy invoice quantities that do not match the transaction", async (action) => {
    const legacyLogs = makeLegacyInvoiceLogs();
    legacyLogs[0].quantity = 1;
    const tx = makeTx({ inventoryLogs: legacyLogs });

    const onWarning = vi.fn();
    const result = reverseTransaction(tx as never, {
      storeId: "store-1",
      transactionId: "tx-1",
      action, onWarning,
      actor: { id: "owner-1", name: "Owner One", role: "OWNER" },
    });
    if (action === "VOID") {
      await expect(result).rejects.toMatchObject({ code: "STOCK_HISTORY_REVIEW_REQUIRED" });
      expect(onWarning).not.toHaveBeenCalled();
    } else {
      await expect(result).resolves.toBe("APPLIED");
      expect(onWarning).toHaveBeenCalledOnce();
    }

    expect(tx.product.updateMany).not.toHaveBeenCalled();
    expect(tx.inventoryLog.createMany).not.toHaveBeenCalled();
    expect(tx.transaction.deleteMany).toHaveBeenCalledTimes(action === "DELETE" ? 1 : 0);
  });

  it.each(["VOID", "DELETE"] as const)("handles %s with legacy invoice evidence after a product joins a shared stock group", async (action) => {
    const tx = makeTx({ inventoryLogs: makeLegacyInvoiceLogs() });
    tx.product.findMany.mockImplementation(({ where }: any) =>
      Promise.resolve(
        where.id.in.map((id: string) => ({
          id,
          stockGroupId: id === "finished-paper" ? "paper-group" : null,
          unitMultiplierToBase: id === "finished-paper" ? 4 : 1,
          conversionNeedsReview: false,
        })),
      ),
    );

    const onWarning = vi.fn();
    const result = reverseTransaction(tx as never, {
      storeId: "store-1",
      transactionId: "tx-1",
      action, onWarning,
      actor: { id: "owner-1", name: "Owner One", role: "OWNER" },
    });
    if (action === "VOID") {
      await expect(result).rejects.toMatchObject({ code: "STOCK_HISTORY_REVIEW_REQUIRED" });
      expect(onWarning).not.toHaveBeenCalled();
    } else {
      await expect(result).resolves.toBe("APPLIED");
      expect(onWarning).toHaveBeenCalledOnce();
    }

    expect(tx.product.updateMany).not.toHaveBeenCalled();
    expect(tx.productStockGroup.updateMany).not.toHaveBeenCalled();
    expect(tx.inventoryLog.createMany).not.toHaveBeenCalled();
    expect(tx.transaction.deleteMany).toHaveBeenCalledTimes(action === "DELETE" ? 1 : 0);
  });

  it("does not restore stock a second time when deleting an already-voided transaction", async () => {
    const voidedTransaction = { ...transaction, status: "VOIDED" };
    const returnedJournal = [
      ...journal,
      {
        ...journal[0],
        id: "void-return-finished",
        type: "IN",
        reason: "SALE_RETURN",
        stockBaseDelta: 1,
      },
      {
        ...journal[2],
        id: "void-return-paper",
        type: "IN",
        reason: "SALE_RETURN",
        stockBaseDelta: 12,
      },
    ];
    const tx = makeTx({ current: voidedTransaction, inventoryLogs: returnedJournal });

    await expect(
      reverseTransaction(tx as never, {
        storeId: "store-1",
        transactionId: "tx-1",
        action: "DELETE",
        actor: { id: "owner-1", name: "Owner One", role: "OWNER" },
      }),
    ).resolves.toBe("APPLIED");

    expect(tx.product.updateMany).not.toHaveBeenCalled();
    expect(tx.productStockGroup.updateMany).not.toHaveBeenCalled();
    expect(tx.inventoryLog.createMany).not.toHaveBeenCalled();
    expect(tx.inventoryLog.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { transactionId: null, sourceTransactionRef: "tx-1" },
      }),
    );
    expect(tx.transaction.deleteMany).toHaveBeenCalledWith({
      where: { id: "tx-1", storeId: "store-1", status: "VOIDED" },
    });
    expect(tx.transactionLifecycleAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "DELETE", transactionId: "tx-1" }),
      }),
    );
  });

  it("rejects a missing raw-material journal even when the finished product has proof", async () => {
    const tx = makeTx({ inventoryLogs: journal.filter((entry) => entry.productId !== "raw-paper") });

    await expect(
      reverseTransaction(tx as never, {
        storeId: "store-1",
        transactionId: "tx-1",
        action: "VOID",
        actor: { id: "owner-1", name: "Owner One", role: "OWNER" },
      }),
    ).rejects.toMatchObject({ code: "STOCK_HISTORY_REVIEW_REQUIRED" });

    expect(tx.product.updateMany).not.toHaveBeenCalled();
    expect(tx.transaction.updateMany).not.toHaveBeenCalled();
  });

  it("cancels pending and confirmed delivery documents while returning transaction-owned stock once", async () => {
    const transactionWithPendingDelivery = {
      ...transaction,
      suratJalan: [
        { id: "sj-1", number: "SJ-001", status: "PENDING", items: [] },
        { id: "sj-2", number: "SJ-002", status: "CONFIRMED", items: [] },
        { id: "sj-3", number: "SJ-003", status: "CANCELLED", items: [] },
        { id: "sj-4", number: "SJ-004", status: "REJECTED", items: [] },
      ],
    };
    const tx = makeTx({ current: transactionWithPendingDelivery });

    await expect(
      reverseTransaction(tx as never, {
        storeId: "store-1",
        transactionId: "tx-1",
        action: "VOID",
        actor: { id: "owner-1", name: "Owner One", role: "OWNER" },
      }),
    ).resolves.toBe("APPLIED");

    expect(tx.suratJalan.updateMany).toHaveBeenCalledWith({
      where: { transactionId: "tx-1", storeId: "store-1", status: { in: ["PENDING", "CONFIRMED"] } },
      data: { status: "CANCELLED", cancelledAt: expect.any(Date) },
    });
    expect(tx.product.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.productStockGroup.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.transactionLifecycleAudit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ snapshot: expect.objectContaining({ suratJalan: transactionWithPendingDelivery.suratJalan }) }),
    });
  });

  it("restores only partially shipped quantity when the original stock history is proven", async () => {
    const legacyTransaction = {
      ...transaction,
      stockDeductionSource: "SURAT_JALAN",
      items: [{ ...transaction.items[0], quantity: 10, rawMaterialProductId: null, rawMaterialQuantity: null }],
      suratJalan: [{
        id: "sj-1",
        number: "SJ-001",
        status: "CONFIRMED",
        items: [{ productId: "finished-paper", quantity: 4 }],
      }],
    };
    const shipmentJournal: any[] = [
      { ...journal[0], quantity: 10, stockBaseDelta: -10 },
      {
        ...journal[0],
        id: "legacy-invoice-return",
        type: "IN",
        reason: "SALE_RETURN",
        quantity: 10,
        stockBaseDelta: 10,
      },
      {
        ...journal[0],
        id: "partial-shipment-out",
        quantity: 4,
        stockBaseDelta: -4,
        suratJalanId: "sj-1",
      },
    ];
    const tx = makeTx({ current: legacyTransaction, inventoryLogs: shipmentJournal });

    await expect(
      reverseTransaction(tx as never, {
        storeId: "store-1",
        transactionId: "tx-1",
        action: "VOID",
        actor: { id: "owner-1", name: "Owner One", role: "OWNER" },
      }),
    ).resolves.toBe("APPLIED");

    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: { id: "finished-paper", storeId: "store-1", stockGroupId: null },
      data: { stock: { increment: 4 } },
    });
  });

  it("restores legacy confirmed Surat Jalan quantity from its exact linked sale log", async () => {
    const history = makeLegacyShipmentHistory();
    const tx = makeTx({ current: history.transaction, inventoryLogs: history.logs });

    await expect(
      reverseTransaction(tx as never, {
        storeId: "store-1",
        transactionId: "tx-1",
        action: "VOID",
        actor: { id: "owner-1", name: "Owner One", role: "OWNER" },
      }),
    ).resolves.toBe("APPLIED");

    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: { id: "finished-paper", storeId: "store-1", stockGroupId: null },
      data: { stock: { increment: 4 } },
    });
    expect(tx.inventoryLog.updateMany).toHaveBeenCalledWith({
      where: {
        id: "legacy-shipment-sale",
        transactionId: "tx-1",
        sourceTransactionRef: null,
      },
      data: {
        sourceTransactionRef: "tx-1",
        stockGroupIdSnapshot: null,
        unitMultiplierSnapshot: 1,
        stockBaseDelta: -4,
      },
    });
    expect(tx.inventoryLog.updateMany).toHaveBeenCalledWith({
      where: {
        id: "legacy-invoice-reversal",
        transactionId: "tx-1",
        sourceTransactionRef: null,
      },
      data: {
        sourceTransactionRef: "tx-1",
        stockGroupIdSnapshot: null,
        unitMultiplierSnapshot: 1,
        stockBaseDelta: 10,
      },
    });
  });

  it("rejects legacy shipment logs when the confirmed item quantity does not match", async () => {
    const history = makeLegacyShipmentHistory(3);
    const tx = makeTx({ current: history.transaction, inventoryLogs: history.logs });

    await expect(
      reverseTransaction(tx as never, {
        storeId: "store-1",
        transactionId: "tx-1",
        action: "VOID",
        actor: { id: "owner-1", name: "Owner One", role: "OWNER" },
      }),
    ).rejects.toMatchObject({ code: "STOCK_HISTORY_REVIEW_REQUIRED" });

    expect(tx.product.updateMany).not.toHaveBeenCalled();
    expect(tx.inventoryLog.updateMany).not.toHaveBeenCalled();
    expect(tx.transaction.updateMany).not.toHaveBeenCalled();
  });

  it("rejects legacy shipment history when the invoice reversal does not exactly offset invoice stock", async () => {
    const history = makeLegacyShipmentHistory();
    history.logs.find((row) => row.id === "legacy-invoice-reversal")!.quantity = 9;
    const tx = makeTx({ current: history.transaction, inventoryLogs: history.logs });

    await expect(
      reverseTransaction(tx as never, {
        storeId: "store-1",
        transactionId: "tx-1",
        action: "VOID",
        actor: { id: "owner-1", name: "Owner One", role: "OWNER" },
      }),
    ).rejects.toMatchObject({ code: "STOCK_HISTORY_REVIEW_REQUIRED" });

    expect(tx.product.updateMany).not.toHaveBeenCalled();
    expect(tx.productStockGroup.updateMany).not.toHaveBeenCalled();
    expect(tx.inventoryLog.updateMany).not.toHaveBeenCalled();
    expect(tx.transaction.updateMany).not.toHaveBeenCalled();
  });

  it("rejects legacy shipment logs when the delivered product uses a stock group", async () => {
    const history = makeLegacyShipmentHistory();
    const tx = makeTx({ current: history.transaction, inventoryLogs: history.logs });
    tx.product.findMany.mockResolvedValue([
      {
        id: "finished-paper",
        stockGroupId: "paper-group",
        unitMultiplierToBase: 4,
        conversionNeedsReview: false,
      },
    ]);

    await expect(
      reverseTransaction(tx as never, {
        storeId: "store-1",
        transactionId: "tx-1",
        action: "VOID",
        actor: { id: "owner-1", name: "Owner One", role: "OWNER" },
      }),
    ).rejects.toMatchObject({ code: "STOCK_HISTORY_REVIEW_REQUIRED" });

    expect(tx.product.updateMany).not.toHaveBeenCalled();
    expect(tx.productStockGroup.updateMany).not.toHaveBeenCalled();
    expect(tx.inventoryLog.updateMany).not.toHaveBeenCalled();
    expect(tx.transaction.updateMany).not.toHaveBeenCalled();
  });

  it("restores the full shipped quantity when the full shipment history is proven", async () => {
    const legacyTransaction = {
      ...transaction,
      stockDeductionSource: "SURAT_JALAN",
      items: [{ ...transaction.items[0], quantity: 10, rawMaterialProductId: null, rawMaterialQuantity: null }],
      suratJalan: [{
        id: "sj-1",
        number: "SJ-001",
        status: "CONFIRMED",
        items: [{ productId: "finished-paper", quantity: 10 }],
      }],
    };
    const shipmentJournal: any[] = [
      { ...journal[0], quantity: 10, stockBaseDelta: -10 },
      {
        ...journal[0],
        id: "legacy-invoice-return",
        type: "IN",
        reason: "SALE_RETURN",
        quantity: 10,
        stockBaseDelta: 10,
      },
      {
        ...journal[0],
        id: "full-shipment-out",
        quantity: 10,
        stockBaseDelta: -10,
        suratJalanId: "sj-1",
      },
    ];
    const tx = makeTx({ current: legacyTransaction, inventoryLogs: shipmentJournal });

    await expect(
      reverseTransaction(tx as never, {
        storeId: "store-1",
        transactionId: "tx-1",
        action: "VOID",
        actor: { id: "owner-1", name: "Owner One", role: "OWNER" },
      }),
    ).resolves.toBe("APPLIED");

    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: { id: "finished-paper", storeId: "store-1", stockGroupId: null },
      data: { stock: { increment: 10 } },
    });
  });

  it("fails closed when legacy shipment history omits the original deduction proof", async () => {
    const legacyTransaction = {
      ...transaction,
      stockDeductionSource: "SURAT_JALAN",
      items: [{ ...transaction.items[0], quantity: 10, rawMaterialProductId: null, rawMaterialQuantity: null }],
      suratJalan: [{
        id: "sj-1",
        number: "SJ-001",
        status: "CONFIRMED",
        items: [{ productId: "finished-paper", quantity: 4 }],
      }],
    };
    const unprovenHistory: any[] = [
      {
        ...journal[0],
        id: "legacy-invoice-return",
        type: "IN",
        reason: "SALE_RETURN",
        quantity: 10,
        stockBaseDelta: 10,
      },
      {
        ...journal[0],
        id: "partial-shipment-out",
        quantity: 4,
        stockBaseDelta: -4,
        suratJalanId: "sj-1",
      },
    ];
    const tx = makeTx({ current: legacyTransaction, inventoryLogs: unprovenHistory });

    await expect(
      reverseTransaction(tx as never, {
        storeId: "store-1",
        transactionId: "tx-1",
        action: "VOID",
        actor: { id: "owner-1", name: "Owner One", role: "OWNER" },
      }),
    ).rejects.toMatchObject({ code: "STOCK_HISTORY_REVIEW_REQUIRED" });

    expect(tx.product.updateMany).not.toHaveBeenCalled();
    expect(tx.transaction.updateMany).not.toHaveBeenCalled();
  });

  it("deletes all shipment items and documents before invoice items and retains their audit snapshot", async () => {
    const shipments = [
      { id: "sj-1", number: "SJ-001", status: "PENDING", items: [{ id: "sj-item-1", transactionItemId: "item-1", productId: "finished-paper", quantity: 1 }] },
      { id: "sj-2", number: "SJ-002", status: "CONFIRMED", items: [{ id: "sj-item-2", transactionItemId: "item-1", productId: "finished-paper", quantity: 1 }] },
      { id: "sj-3", number: "SJ-003", status: "CANCELLED", items: [] },
      { id: "sj-4", number: "SJ-004", status: "REJECTED", items: [] },
    ];
    const tx = makeTx({ current: { ...transaction, suratJalan: shipments } });

    await expect(reverseTransaction(tx as never, {
      storeId: "store-1", transactionId: "tx-1", action: "DELETE",
      actor: { id: "owner-1", name: "Owner", role: "OWNER" },
    })).resolves.toBe("APPLIED");

    expect(tx.suratJalanItem.deleteMany).toHaveBeenCalledWith({ where: { suratJalanId: { in: ["sj-1", "sj-2", "sj-3", "sj-4"] } } });
    expect(tx.suratJalan.deleteMany).toHaveBeenCalledWith({ where: { transactionId: "tx-1", storeId: "store-1" } });
    expect(tx.suratJalanItem.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(tx.suratJalan.deleteMany.mock.invocationCallOrder[0]);
    expect(tx.suratJalan.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(tx.transactionItem.deleteMany.mock.invocationCallOrder[0]);
    expect(tx.transactionItem.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(tx.transaction.deleteMany.mock.invocationCallOrder[0]);
    expect(tx.inventoryLog.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { transactionId: null, sourceTransactionRef: "tx-1" } }));
    expect(tx.inventoryLog.updateMany).toHaveBeenCalledWith({
      where: { suratJalanId: { in: ["sj-1", "sj-2", "sj-3", "sj-4"] } },
      data: { suratJalanId: null },
    });
    expect(tx.inventoryLog.updateMany.mock.invocationCallOrder.at(-1)!).toBeLessThan(tx.suratJalan.deleteMany.mock.invocationCallOrder[0]);
    expect(tx.transactionLifecycleAudit.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      action: "DELETE", snapshot: expect.objectContaining({
        suratJalan: shipments,
        stockJournal: expect.arrayContaining([expect.objectContaining({ id: "sale-finished", sourceTransactionRef: "tx-1", transactionId: "tx-1" })]),
      }),
    }) });
    expect(tx.product.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.productStockGroup.updateMany).toHaveBeenCalledTimes(1);
  });

  it.each(["VOID", "DELETE"] as const)("%s reverses each proven legacy delivery only once alongside a pending document", async (action) => {
    const history = makeLegacyShipmentHistory();
    const shipments = [
      ...history.transaction.suratJalan,
      { id: "sj-legacy-2", number: "SJ-LEGACY-002", status: "CONFIRMED", items: [{ id: "sj-item-2", productId: "finished-paper", quantity: 2 }] },
      { id: "sj-pending", number: "SJ-PENDING", status: "PENDING", items: [{ id: "sj-pending-item", productId: "finished-paper", quantity: 4 }] },
    ];
    const shipmentLog = history.logs.find((row) => row.id === "legacy-shipment-sale")!;
    const tx = makeTx({ current: { ...history.transaction, suratJalan: shipments }, inventoryLogs: [
      ...history.logs,
      { ...shipmentLog, id: "legacy-second-sale", quantity: 2, suratJalanId: "sj-legacy-2", note: "Surat Jalan SJ-LEGACY-002 untuk invoice tx-1" },
    ] });

    await expect(reverseTransaction(tx as never, {
      storeId: "store-1", transactionId: "tx-1", action,
      actor: { id: "owner-1", name: "Owner", role: "OWNER" },
    })).resolves.toBe("APPLIED");

    expect(tx.product.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: "finished-paper", storeId: "store-1", stockGroupId: null },
      data: { stock: { increment: 6 } },
    });
    expect(tx.inventoryLog.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ productId: "finished-paper", stockBaseDelta: 6, sourceTransactionRef: "tx-1" })] });
  });

  it("deletes cancelled delivery documents after a legacy void without a second stock return", async () => {
    const history = makeLegacyShipmentHistory();
    const signedRows = history.logs.map((row) => ({ ...row, sourceTransactionRef: "tx-1", unitMultiplierSnapshot: 1, stockBaseDelta: row.type === "OUT" ? -row.quantity : row.quantity }));
    const tx = makeTx({ current: { ...history.transaction, status: "VOIDED", suratJalan: history.transaction.suratJalan.map((shipment) => ({ ...shipment, status: "CANCELLED" })) }, inventoryLogs: [
      ...signedRows,
      { ...signedRows[2], id: "void-return", type: "IN", reason: "SALE_RETURN", quantity: 4, stockBaseDelta: 4, suratJalanId: null },
    ] });

    await expect(reverseTransaction(tx as never, {
      storeId: "store-1", transactionId: "tx-1", action: "DELETE",
      actor: { id: "owner-1", name: "Owner", role: "OWNER" },
    })).resolves.toBe("APPLIED");

    expect(tx.product.updateMany).not.toHaveBeenCalled();
    expect(tx.inventoryLog.createMany).not.toHaveBeenCalled();
    expect(tx.customer.updateMany).not.toHaveBeenCalled();
    expect(tx.suratJalan.deleteMany).toHaveBeenCalledOnce();
    expect(tx.inventoryLog.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { transactionId: null, sourceTransactionRef: "tx-1" } }));
  });

  it("does not repeat a void of a legacy VOIDED row even when its lifecycle audit predates this service", async () => {
    const tx = makeTx({ current: { ...transaction, status: "VOIDED", suratJalan: [{ id: "sj-1", status: "CANCELLED", items: [] }] } });

    await expect(reverseTransaction(tx as never, {
      storeId: "store-1", transactionId: "tx-1", action: "VOID",
      actor: { id: "owner-1", name: "Owner", role: "OWNER" },
    })).resolves.toBe("ALREADY_VOIDED");

    expect(tx.product.updateMany).not.toHaveBeenCalled();
    expect(tx.productStockGroup.updateMany).not.toHaveBeenCalled();
    expect(tx.suratJalan.updateMany).not.toHaveBeenCalled();
    expect(tx.transactionLifecycleAudit.create).not.toHaveBeenCalled();
  });

  it.each(["DRAFT", "VOIDED"])("deletes an unconverted %s quotation with a recorded warning and no guessed stock", async (status) => {
    const tx = makeTx({ current: { ...transaction, status, invoiceNumber: null, draftNumber: "PENAWARAN-CUSTOM-123" }, inventoryLogs: [] });
    const onWarning = vi.fn();

    await expect(reverseTransaction(tx as never, {
      storeId: "store-1", transactionId: "tx-1", action: "DELETE",
      actor: { id: "owner-1", name: "Owner", role: "OWNER" }, onWarning,
    })).resolves.toBe("APPLIED");

    expect(tx.transaction.deleteMany).toHaveBeenCalledOnce();
    expect(tx.product.updateMany).not.toHaveBeenCalled();
    expect(tx.productStockGroup.updateMany).not.toHaveBeenCalled();
    expect(tx.inventoryLog.createMany).not.toHaveBeenCalled();
    expect(tx.customer.updateMany).not.toHaveBeenCalled();
    expect(onWarning).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ code: "STOCK_HISTORY_REVIEW_REQUIRED", message: expect.any(String) }));
    expect(tx.transactionLifecycleAudit.create).toHaveBeenCalledWith({ data: expect.objectContaining({ snapshot: expect.objectContaining({
      warnings: [expect.objectContaining({ code: "STOCK_HISTORY_REVIEW_REQUIRED" })],
      stockHistoryReviewRequired: true,
      stockReturns: [],
      transaction: expect.objectContaining({ draftNumber: "PENAWARAN-CUSTOM-123" }),
    }) }) });
    expect(tx.transactionLifecycleAudit.create.mock.invocationCallOrder[0]).toBeLessThan(onWarning.mock.invocationCallOrder[0]);
  });

  it("downgrades inconsistent quotation evidence without applying any uncertain return", async () => {
    const tx = makeTx({ current: { ...transaction, status: "VOIDED", invoiceNumber: null, draftNumber: "CUSTOM-QUOTATION" }, inventoryLogs: journal.map((row) => ({ ...row, stockBaseDelta: null })) });
    const onWarning = vi.fn();

    await expect(reverseTransaction(tx as never, {
      storeId: "store-1", transactionId: "tx-1", action: "DELETE",
      actor: { id: "owner-1", name: "Owner", role: "OWNER" }, onWarning,
    })).resolves.toBe("APPLIED");

    expect(onWarning).toHaveBeenCalledOnce();
    expect(tx.product.updateMany).not.toHaveBeenCalled();
    expect(tx.inventoryLog.createMany).not.toHaveBeenCalled();
    expect(tx.inventoryLog.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { transactionId: null, sourceTransactionRef: "tx-1" } }));
  });

  it.each(["DRAFT", "VOIDED", "COMPLETED"])("returns proven journal stock when deleting an unconverted %s quotation without reversing customer totals", async (status) => {
    const tx = makeTx({ current: { ...transaction, status, invoiceNumber: null, draftNumber: "CUSTOM-QUOTATION" } });
    const onWarning = vi.fn();

    await expect(reverseTransaction(tx as never, {
      storeId: "store-1", transactionId: "tx-1", action: "DELETE",
      actor: { id: "owner-1", name: "Owner", role: "OWNER" }, onWarning,
    })).resolves.toBe("APPLIED");

    expect(tx.product.updateMany).toHaveBeenCalledExactlyOnceWith({ where: { id: "finished-paper", storeId: "store-1", stockGroupId: null }, data: { stock: { increment: 1 } } });
    expect(tx.productStockGroup.updateMany).toHaveBeenCalledExactlyOnceWith({ where: { id: "paper-group", storeId: "store-1" }, data: { baseStock: { increment: 12 } } });
    expect(tx.customer.updateMany).not.toHaveBeenCalled();
    expect(onWarning).not.toHaveBeenCalled();
  });

  it.each([
    { label: "ATK", invoiceNumber: "INV-ATK-123", printingReceiptId: null },
    { label: "Percetakan", invoiceNumber: "INV-PRINT-123", printingReceiptId: "print-1" },
    { label: "converted quotation", invoiceNumber: "INV-CONVERTED-123", draftNumber: "CUSTOM-QUOTATION" },
  ])("deletes $label with a warning for missing or inconsistent evidence while reversing customer totals", async (invoice) => {
    for (const inventoryLogs of [[], journal.map((row) => ({ ...row, stockBaseDelta: null }))]) {
      const tx = makeTx({ current: { ...transaction, ...invoice }, inventoryLogs });
      const onWarning = vi.fn();

      await expect(reverseTransaction(tx as never, {
        storeId: "store-1", transactionId: "tx-1", action: "DELETE",
        actor: { id: "owner-1", name: "Owner", role: "OWNER" }, onWarning,
      })).resolves.toBe("APPLIED");

      expect(tx.transaction.deleteMany).toHaveBeenCalledOnce();
      expect(tx.customer.updateMany).toHaveBeenCalledExactlyOnceWith({
        where: expect.objectContaining({ id: "customer-1", storeId: "store-1" }),
        data: { totalOrders: { decrement: 1 }, totalSpent: { decrement: 75 }, totalDebt: { decrement: 25 } },
      });
      expect(tx.product.updateMany).not.toHaveBeenCalled();
      expect(tx.productStockGroup.updateMany).not.toHaveBeenCalled();
      expect(tx.inventoryLog.createMany).not.toHaveBeenCalled();
      expect(onWarning).toHaveBeenCalledExactlyOnceWith({
        code: "STOCK_HISTORY_REVIEW_REQUIRED",
        message: "Transaksi dihapus, tetapi riwayat stok perlu diperiksa. Stok yang tidak dapat dipastikan tidak dikembalikan.",
      });
      expect(tx.transactionLifecycleAudit.create).toHaveBeenCalledWith({ data: expect.objectContaining({ snapshot: expect.objectContaining({
        stockHistoryReviewRequired: true, stockReturns: [], warnings: [expect.objectContaining({ code: "STOCK_HISTORY_REVIEW_REQUIRED" })],
      }) }) });
    }
  });

  it.each([
    { invoiceNumber: "CUSTOM-INV-123", draftNumber: "CUSTOM-QUOTATION" },
    { invoiceNumber: "DRAFT-123", draftNumber: "CUSTOM-QUOTATION" },
    { invoiceNumber: null, draftNumber: null },
  ])("deletes converted or unidentified quotations with a stock review warning: %j", async ({ invoiceNumber, draftNumber }) => {
    const tx = makeTx({ current: { ...transaction, status: "VOIDED", invoiceNumber, draftNumber }, inventoryLogs: [] });
    const onWarning = vi.fn();

    await expect(reverseTransaction(tx as never, {
      storeId: "store-1", transactionId: "tx-1", action: "DELETE",
      actor: { id: "owner-1", name: "Owner", role: "OWNER" }, onWarning,
    })).resolves.toBe("APPLIED");

    expect(tx.transaction.deleteMany).toHaveBeenCalledOnce();
    expect(onWarning).toHaveBeenCalledOnce();
  });

  it.each(["missing", "inconsistent"])("deletes linked delivery documents with %s stock evidence and an audit warning", async (evidence) => {
    const legacy = makeLegacyShipmentHistory(3);
    const tx = makeTx({ current: legacy.transaction, inventoryLogs: evidence === "missing" ? [] : legacy.logs });
    const onWarning = vi.fn();

    await expect(reverseTransaction(tx as never, {
      storeId: "store-1", transactionId: "tx-1", action: "DELETE",
      actor: { id: "owner-1", name: "Owner", role: "OWNER" }, onWarning,
    })).resolves.toBe("APPLIED");

    expect(tx.suratJalanItem.deleteMany).toHaveBeenCalledOnce();
    expect(tx.suratJalan.deleteMany).toHaveBeenCalledOnce();
    expect(tx.transaction.deleteMany).toHaveBeenCalledOnce();
    expect(tx.product.updateMany).not.toHaveBeenCalled();
    expect(tx.inventoryLog.createMany).not.toHaveBeenCalled();
    expect(onWarning).toHaveBeenCalledOnce();
    expect(tx.transactionLifecycleAudit.create).toHaveBeenCalledWith({ data: expect.objectContaining({ snapshot: expect.objectContaining({
      stockHistoryReviewRequired: true, stockReturns: [],
      suratJalan: [expect.objectContaining({ id: "sj-legacy-1" })],
    }) }) });
  });

  it("keeps customer balance failures blocking even when stock evidence only requires review", async () => {
    const tx = makeTx({ inventoryLogs: [] });
    tx.customer.updateMany.mockResolvedValueOnce({ count: 0 });
    const onWarning = vi.fn();

    await expect(reverseTransaction(tx as never, {
      storeId: "store-1", transactionId: "tx-1", action: "DELETE",
      actor: { id: "owner-1", name: "Owner", role: "OWNER" }, onWarning,
    })).rejects.toBeInstanceOf(TransactionReversalConflictError);

    expect(tx.transaction.deleteMany).not.toHaveBeenCalled();
    expect(onWarning).not.toHaveBeenCalled();
  });

  it.each(["DRAFT", "PENDING_APPROVAL"])("voids %s without changing customer totals when there is no stock evidence", async (status) => {
    const tx = makeTx({ current: { ...transaction, status, invoiceNumber: null, draftNumber: status === "DRAFT" ? "CUSTOM-QUOTATION" : null }, inventoryLogs: [] });

    await expect(reverseTransaction(tx as never, {
      storeId: "store-1", transactionId: "tx-1", action: "VOID",
      actor: { id: "owner-1", name: "Owner", role: "OWNER" },
    })).resolves.toBe("APPLIED");

    expect(tx.transaction.updateMany).toHaveBeenCalledWith({ where: { id: "tx-1", storeId: "store-1", status }, data: { status: "VOIDED" } });
    expect(tx.customer.updateMany).not.toHaveBeenCalled();
    expect(tx.product.updateMany).not.toHaveBeenCalled();
  });

  it.each(["REFUNDED", "UNKNOWN"])("rejects VOID for terminal or unsupported status %s", async (status) => {
    const tx = makeTx({ current: { ...transaction, status } });

    await expect(reverseTransaction(tx as never, {
      storeId: "store-1", transactionId: "tx-1", action: "VOID",
      actor: { id: "owner-1", name: "Owner", role: "OWNER" },
    })).rejects.toBeInstanceOf(TransactionReversalConflictError);

    expect(tx.transaction.updateMany).not.toHaveBeenCalled();
    expect(tx.product.updateMany).not.toHaveBeenCalled();
  });

  it.each(["stockLock", "productUpdate", "productRead", "transactionDelete", "auditWrite", "historyRead"])("does not turn quotation %s failures into a successful warning", async (failure) => {
    const tx = makeTx({ current: { ...transaction, invoiceNumber: null, draftNumber: "CUSTOM-QUOTATION" } });
    const onWarning = vi.fn();
    if (failure === "stockLock") tx.$queryRaw.mockResolvedValueOnce([]);
    if (failure === "productUpdate") tx.product.updateMany.mockResolvedValueOnce({ count: 0 });
    if (failure === "productRead") tx.product.findFirst.mockResolvedValueOnce(null as never);
    if (failure === "transactionDelete") tx.transaction.deleteMany.mockResolvedValueOnce({ count: 0 });
    if (failure === "auditWrite") tx.transactionLifecycleAudit.create.mockRejectedValueOnce(new Error("audit unavailable"));
    if (failure === "historyRead") tx.inventoryLog.findMany.mockRejectedValueOnce(new Error("database unavailable"));

    await expect(reverseTransaction(tx as never, {
      storeId: "store-1", transactionId: "tx-1", action: "DELETE",
      actor: { id: "owner-1", name: "Owner", role: "OWNER" }, onWarning,
    })).rejects.toThrow();

    expect(onWarning).not.toHaveBeenCalled();
  });

  it.each(["transactionDelete", "auditWrite"])("does not publish a quotation proof warning if the later %s fails", async (failure) => {
    const tx = makeTx({ current: { ...transaction, status: "VOIDED", invoiceNumber: null, draftNumber: "CUSTOM-QUOTATION" }, inventoryLogs: [] });
    if (failure === "transactionDelete") tx.transaction.deleteMany.mockResolvedValueOnce({ count: 0 });
    if (failure === "auditWrite") tx.transactionLifecycleAudit.create.mockRejectedValueOnce(new TransactionReversalConflictError("Audit tidak tersimpan."));
    const onWarning = vi.fn();

    await expect(reverseTransaction(tx as never, {
      storeId: "store-1", transactionId: "tx-1", action: "DELETE",
      actor: { id: "owner-1", name: "Owner", role: "OWNER" }, onWarning,
    })).rejects.toBeInstanceOf(TransactionReversalConflictError);

    expect(tx.transaction.deleteMany).toHaveBeenCalledOnce();
    expect(onWarning).not.toHaveBeenCalled();
  });

  it("keeps a transaction status race blocking even for an unconverted quotation", async () => {
    const quotation = { ...transaction, status: "VOIDED", invoiceNumber: null, draftNumber: "CUSTOM-QUOTATION" };
    const tx = makeTx({ current: quotation, inventoryLogs: [] });
    tx.transaction.findFirst.mockResolvedValueOnce(quotation).mockResolvedValueOnce({ ...quotation, status: "DRAFT" });
    const onWarning = vi.fn();

    await expect(reverseTransaction(tx as never, {
      storeId: "store-1", transactionId: "tx-1", action: "DELETE",
      actor: { id: "owner-1", name: "Owner", role: "OWNER" }, onWarning,
    })).rejects.toBeInstanceOf(TransactionReversalConflictError);

    expect(tx.inventoryLog.findMany).not.toHaveBeenCalled();
    expect(tx.transaction.deleteMany).not.toHaveBeenCalled();
    expect(onWarning).not.toHaveBeenCalled();
  });

  it("retains NOT_FOUND without publishing warnings or mutating linked documents", async () => {
    const tx = makeTx();
    tx.transaction.findFirst.mockResolvedValue(null);
    const onWarning = vi.fn();

    await expect(reverseTransaction(tx as never, {
      storeId: "store-1", transactionId: "tx-1", action: "DELETE",
      actor: { id: "owner-1", name: "Owner", role: "OWNER" }, onWarning,
    })).resolves.toBe("NOT_FOUND");

    expect(tx.suratJalan.deleteMany).not.toHaveBeenCalled();
    expect(tx.transaction.deleteMany).not.toHaveBeenCalled();
    expect(onWarning).not.toHaveBeenCalled();
  });

  it("deletes the processed printing receipt before its restricted invoice and snapshots its original document", async () => {
    const printingReceipt = {
      id: "printing-receipt-1", storeId: "store-1", transactionId: "tx-1",
      number: "CP-001", subcategory: "DIGITAL", revision: 3,
      document: { items: [{ label: "Poster", quantity: 2 }] },
      createdById: "owner-1", createdAt: new Date("2026-11-01T01:00:00Z"), updatedAt: new Date("2026-11-02T01:00:00Z"),
    };
    const tx = makeTx({ current: { ...transaction, printingReceipt } });
    let receiptAttached = true;
    tx.printingReceipt.deleteMany.mockImplementation(async ({ where }: any) => {
      if (where.storeId !== "store-1" || where.transactionId !== "tx-1") return { count: 0 };
      receiptAttached = false;
      return { count: 1 };
    });
    tx.transaction.deleteMany.mockImplementation(async () => {
      if (receiptAttached) throw new Error("PrintingReceipt.transactionId restricts deletion");
      return { count: 1 };
    });

    await expect(reverseTransaction(tx as never, {
      storeId: "store-1", transactionId: "tx-1", action: "DELETE",
      actor: { id: "owner-1", name: "Owner", role: "OWNER" },
    })).resolves.toBe("APPLIED");

    expect(tx.transaction.findFirst).toHaveBeenCalledWith(expect.objectContaining({ include: expect.objectContaining({ printingReceipt: true }) }));
    expect(tx.printingReceipt.deleteMany).toHaveBeenCalledExactlyOnceWith({ where: { transactionId: "tx-1", storeId: "store-1" } });
    expect(tx.printingReceipt.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(tx.transaction.deleteMany.mock.invocationCallOrder[0]);
    expect(tx.transactionLifecycleAudit.create).toHaveBeenCalledWith({ data: expect.objectContaining({ snapshot: expect.objectContaining({
      printingReceipt: expect.objectContaining({ id: "printing-receipt-1", number: "CP-001", revision: 3, transactionId: "tx-1", document: { items: [{ label: "Poster", quantity: 2 }] } }),
    }) }) });
  });

  it("keeps the processed printing receipt attached when voiding its invoice", async () => {
    const printingReceipt = { id: "printing-receipt-1", storeId: "store-1", transactionId: "tx-1", number: "CP-001", document: { items: [] } };
    const tx = makeTx({ current: { ...transaction, printingReceipt } });

    await expect(reverseTransaction(tx as never, {
      storeId: "store-1", transactionId: "tx-1", action: "VOID",
      actor: { id: "owner-1", name: "Owner", role: "OWNER" },
    })).resolves.toBe("APPLIED");

    expect(tx.printingReceipt.deleteMany).not.toHaveBeenCalled();
    expect(tx.transactionLifecycleAudit.create).toHaveBeenCalledWith({ data: expect.objectContaining({ snapshot: expect.objectContaining({ printingReceipt }) }) });
  });

  it("keeps a concurrent printing-receipt deletion blocking before deleting the invoice", async () => {
    const tx = makeTx({ current: { ...transaction, printingReceipt: { id: "printing-receipt-1", number: "CP-001", document: {} } } });
    tx.printingReceipt.deleteMany.mockResolvedValueOnce({ count: 0 });

    await expect(reverseTransaction(tx as never, {
      storeId: "store-1", transactionId: "tx-1", action: "DELETE",
      actor: { id: "owner-1", name: "Owner", role: "OWNER" },
    })).rejects.toBeInstanceOf(TransactionReversalConflictError);

    expect(tx.transaction.deleteMany).not.toHaveBeenCalled();
  });
});
