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

  it("rejects legacy invoice logs when their quantities do not match the transaction", async () => {
    const legacyLogs = makeLegacyInvoiceLogs();
    legacyLogs[0].quantity = 1;
    const tx = makeTx({ inventoryLogs: legacyLogs });

    await expect(
      reverseTransaction(tx as never, {
        storeId: "store-1",
        transactionId: "tx-1",
        action: "DELETE",
        actor: { id: "owner-1", name: "Owner One", role: "OWNER" },
      }),
    ).rejects.toMatchObject({ code: "STOCK_HISTORY_REVIEW_REQUIRED" });

    expect(tx.product.updateMany).not.toHaveBeenCalled();
    expect(tx.inventoryLog.updateMany).not.toHaveBeenCalled();
    expect(tx.transaction.deleteMany).not.toHaveBeenCalled();
  });

  it("rejects legacy invoice logs when either product now uses a shared stock group", async () => {
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

    await expect(
      reverseTransaction(tx as never, {
        storeId: "store-1",
        transactionId: "tx-1",
        action: "DELETE",
        actor: { id: "owner-1", name: "Owner One", role: "OWNER" },
      }),
    ).rejects.toMatchObject({ code: "STOCK_HISTORY_REVIEW_REQUIRED" });

    expect(tx.product.updateMany).not.toHaveBeenCalled();
    expect(tx.productStockGroup.updateMany).not.toHaveBeenCalled();
    expect(tx.inventoryLog.updateMany).not.toHaveBeenCalled();
    expect(tx.transaction.deleteMany).not.toHaveBeenCalled();
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

  it("blocks a void while a linked delivery document is still pending", async () => {
    const transactionWithPendingDelivery = {
      ...transaction,
      suratJalan: [{ id: "sj-1", number: "SJ-001", status: "PENDING", items: [] }],
    };
    const tx = makeTx({ current: transactionWithPendingDelivery });

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
});
