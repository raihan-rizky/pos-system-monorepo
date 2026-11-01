import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDatabaseResetPlan,
  executeDatabaseResetPlan,
} from "../database-reset-plan";
import type { DatabaseResetReadClient } from "../../types/database-reset";

type FakeDbOptions = {
  counts?: Record<string, number>;
  deleteOrder?: string[];
};

function createFakeDb({ counts = {}, deleteOrder = [] }: FakeDbOptions = {}) {
  return new Proxy(
    {},
    {
      get(_target, modelName: string) {
        return {
          count: vi.fn(async () => counts[modelName] ?? 0),
          deleteMany: vi.fn(async () => {
            deleteOrder.push(modelName);
            return { count: counts[modelName] ?? 0 };
          }),
        };
      },
    },
  ) as DatabaseResetReadClient;
}

describe("database reset planner", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("resets only price history without deleting products or requiring their dependencies", async () => {
    const deleteOrder: string[] = [];
    const db = createFakeDb({ counts: { productPriceLog: 7, product: 3, transactionItem: 4, inventoryLog: 2 }, deleteOrder });
    const plan = await createDatabaseResetPlan({ db, storeId: "store-a", models: ["ProductPriceLog"] });

    expect(plan.canExecute).toBe(true);
    expect(plan.requiredDependencies).toEqual([]);
    expect(plan.operations).toEqual([expect.objectContaining({ model: "ProductPriceLog", mode: "selected", count: 7, where: { storeId: "store-a" } })]);
    await executeDatabaseResetPlan(db, plan);
    expect(deleteOrder).toEqual(["productPriceLog"]);
  });

  it("does not permit execution after all sub-data is unchecked", async () => {
    const plan = await createDatabaseResetPlan({ db: createFakeDb(), storeId: "store-a", models: [] });
    expect(plan.operations).toEqual([]);
    expect(plan.canExecute).toBe(false);
  });

  it("does not treat an unrelated finance sub-data choice as a transaction dependency", async () => {
    const plan = await createDatabaseResetPlan({ db: createFakeDb({ counts: { transactionItem: 2 } }), storeId: "store-a", models: ["Product", "Expense"] });
    expect(plan.canExecute).toBe(false);
    expect(plan.requiredDependencies).toContainEqual(expect.objectContaining({ model: "Transaction", blocking: true }));
  });

  it("allows expenses alone without deleting transactions or requiring stock history", async () => {
    const plan = await createDatabaseResetPlan({ db: createFakeDb({ counts: { expense: 2, inventoryLog: 4, suratJalanItem: 3 } }), storeId: "store-a", models: ["Expense"] });
    expect(plan.canExecute).toBe(true);
    expect(plan.operations.map(item => item.model)).toEqual(["Expense"]);
  });

  it("includes mandatory transaction children and deletes them before the parent", async () => {
    const plan = await createDatabaseResetPlan({ db: createFakeDb(), storeId: "store-a", models: ["Transaction"] });
    expect(plan.operations.map(item => item.model)).toContain("TransactionPayment");
    expect(plan.cascades).toContainEqual(expect.objectContaining({ model: "TransactionItem" }));
    expect(plan.operations.findIndex(item => item.model === "TransactionItem")).toBeLessThan(plan.operations.findIndex(item => item.model === "Transaction"));
    expect(plan.operations.map(item => item.model)).not.toContain("CashierShift");
  });

  it("includes import jobs and their rows when batch operations cascade", async () => {
    const plan = await createDatabaseResetPlan({ db: createFakeDb(), storeId: "store-a", models: ["BatchOperation"] });
    expect(plan.operations.map(item => item.model)).toEqual(expect.arrayContaining(["BatchOperation", "BatchOperationItem", "ProductImportJob", "ProductImportJobRow", "ProductImportPlannedRow"]));
    expect(plan.operations.findIndex(item => item.model === "ProductImportJob")).toBeLessThan(plan.operations.findIndex(item => item.model === "BatchOperation"));
  });

  it("deduplicates a sub-data choice that is also required by its parent", async () => {
    const plan = await createDatabaseResetPlan({ db: createFakeDb(), storeId: "store-a", models: ["Product", "ProductPriceLog", "ProductPriceLog"] });
    expect(plan.operations.filter(item => item.model === "ProductPriceLog")).toHaveLength(1);
  });

  it.each([{ models: ["Customer"] as const }, { domains: ["customers"] as const }])("preserves customers with protected manual receivables (%j)", async selection => {
    const plan = await createDatabaseResetPlan({ db: createFakeDb({ counts: { customerReceivable: 1 } }), storeId: "store-a", ...selection });
    expect(plan.canExecute).toBe(false);
    expect(plan.requiredDependencies).toContainEqual(expect.objectContaining({ blocking: true, reason: expect.stringContaining("piutang manual") }));
  });

  it("requires selecting printing receipts before deleting their linked transactions", async () => {
    const plan = await createDatabaseResetPlan({ db: createFakeDb({ counts: { printingReceipt: 1 } }), storeId: "store-a", models: ["Transaction"] });
    expect(plan.canExecute).toBe(false);
    expect(plan.requiredDependencies).toContainEqual(expect.objectContaining({ model: "PrintingReceipt", domain: "salesFinance", blocking: true, reason: expect.stringContaining("Nota Percetakan") }));
    expect(plan.operations.map(operation => operation.model)).not.toContain("PrintingReceipt");
    expect(plan.preserved).toContainEqual(expect.objectContaining({ model: "Nota Percetakan" }));
  });

  it("deletes printing receipts alone only in the current store while preserving transactions and numbering", async () => {
    const printingReceipt = {
      count: vi.fn().mockResolvedValue(2),
      deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
    };
    const db = { printingReceipt } as unknown as DatabaseResetReadClient;
    const plan = await createDatabaseResetPlan({ db, storeId: "store-a", models: ["PrintingReceipt"] });

    expect(plan.canExecute).toBe(true);
    expect(plan.requiredDependencies).toEqual([]);
    expect(plan.operations).toEqual([expect.objectContaining({ model: "PrintingReceipt", mode: "selected", count: 2, where: { storeId: "store-a" } })]);
    expect(plan.preserved).not.toContainEqual(expect.objectContaining({ model: "Nota Percetakan" }));
    expect(plan.preserved).toContainEqual(expect.objectContaining({ model: "Penomoran Nota Percetakan" }));
    await executeDatabaseResetPlan(db, plan);
    expect(printingReceipt.deleteMany).toHaveBeenCalledExactlyOnceWith({ where: { storeId: "store-a" } });
  });

  it.each([
    { models: ["Transaction", "PrintingReceipt"] as const },
    { domains: ["salesFinance"] as const },
  ])("allows explicitly selected printing receipts to be deleted before transactions (%j)", async selection => {
    const deleteOrder: string[] = [];
    const db = createFakeDb({ counts: { printingReceipt: 2, transaction: 2 }, deleteOrder });
    const plan = await createDatabaseResetPlan({ db, storeId: "store-a", ...selection });

    expect(plan.canExecute).toBe(true);
    expect(plan.requiredDependencies.every(dependency => !dependency.blocking)).toBe(true);
    expect(plan.operations.find(operation => operation.model === "PrintingReceipt")?.where).toEqual({ storeId: "store-a" });
    expect(plan.preserved).not.toContainEqual(expect.objectContaining({ model: "Nota Percetakan" }));
    await executeDatabaseResetPlan(db, plan);
    expect(deleteOrder.indexOf("printingReceipt")).toBeGreaterThanOrEqual(0);
    expect(deleteOrder.indexOf("printingReceipt")).toBeLessThan(deleteOrder.indexOf("transaction"));
  });

  it("scopes customer cascade logs to registered customers, preserving unrelated logs", async () => {
    const plan = await createDatabaseResetPlan({ db: createFakeDb(), storeId: "store-a", models: ["Customer"] });
    expect(plan.operations.find(item => item.model === "DebtPaymentLog")?.where).toEqual({ storeId: "store-a", customer: { storeId: "store-a" } });
  });

  it("preserves product-less stock group activity when only products are reset", async () => {
    const plan = await createDatabaseResetPlan({ db: createFakeDb(), storeId: "store-a", models: ["Product"] });
    expect(plan.operations.find(item => item.model === "ProductStockGroupActivity")?.where).toEqual({ product: { storeId: "store-a" } });
  });

  it("includes both parent predicates when product and stock-group activity cascade together", async () => {
    const plan = await createDatabaseResetPlan({ db: createFakeDb(), storeId: "store-a", models: ["Product", "ProductStockGroup"] });
    expect(plan.operations.find(item => item.model === "ProductStockGroupActivity")?.where).toEqual({ OR: [{ product: { storeId: "store-a" } }, { stockGroup: { storeId: "store-a" } }] });
  });

  it("includes empty delivery document headers in a transaction cascade preview", async () => {
    const plan = await createDatabaseResetPlan({ db: createFakeDb({ counts: { suratJalan: 1, suratJalanItem: 0 } }), storeId: "store-a", models: ["Transaction"] });
    expect(plan.cascades).toContainEqual(expect.objectContaining({ model: "SuratJalan", count: 1 }));
    expect(plan.operations.findIndex(item => item.model === "SuratJalan")).toBeLessThan(plan.operations.findIndex(item => item.model === "Transaction"));
  });

  it("scopes supplier cascade links to suppliers in the current store", async () => {
    const plan = await createDatabaseResetPlan({ db: createFakeDb(), storeId: "store-a", models: ["Supplier"] });
    expect(plan.operations.find(item => item.model === "ProductSupplier")?.where).toEqual({ supplier: { storeId: "store-a" } });
  });

  it("keeps shared models out of a current-store plan", async () => {
    const plan = await createDatabaseResetPlan({
      db: createFakeDb({ counts: { product: 2 } }),
      storeId: "store-a",
      domains: ["productCatalog"],
    });

    expect(plan.preserved.some((item) => item.model === "Category")).toBe(true);
    expect(plan.operations).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ model: "Category" })]),
    );
  });

  it("adds cascade children and blocks on required sales dependencies", async () => {
    const plan = await createDatabaseResetPlan({
      db: createFakeDb({
        counts: {
          product: 2,
          productSupplier: 4,
          transactionItem: 3,
        },
      }),
      storeId: "store-a",
      domains: ["productCatalog"],
    });

    expect(plan.cascades.map((item) => item.model)).toContain("ProductSupplier");
    expect(plan.requiredDependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ domain: "salesFinance", blocking: true }),
      ]),
    );
    expect(plan.canExecute).toBe(false);
  });

  it("deduplicates shared operations and orders children before parents", async () => {
    const plan = await createDatabaseResetPlan({
      db: createFakeDb({
        counts: {
          transaction: 2,
          transactionItem: 3,
          transactionPayment: 2,
        },
      }),
      storeId: "store-a",
      domains: ["salesFinance", "inventoryOperations"],
    });

    expect(new Set(plan.operations.map((item) => item.model)).size).toBe(
      plan.operations.length,
    );
    expect(plan.operations.findIndex((item) => item.model === "TransactionItem")).toBeLessThan(
      plan.operations.findIndex((item) => item.model === "Transaction"),
    );
  });

  it("executes only planned operations in their deterministic order", async () => {
    const deleteOrder: string[] = [];
    const db = createFakeDb({
      counts: { transaction: 1, transactionItem: 1 },
      deleteOrder,
    });
    const plan = await createDatabaseResetPlan({
      db,
      storeId: "store-a",
      domains: ["salesFinance"],
    });

    const summary = await executeDatabaseResetPlan(db, plan);

    expect(deleteOrder.indexOf("transactionItem")).toBeLessThan(
      deleteOrder.indexOf("transaction"),
    );
    expect(summary.deleted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ model: "Transaction", count: 1 }),
      ]),
    );
  });

  it("blocks sales reset when stock records reference its transactions", async () => {
    const plan = await createDatabaseResetPlan({
      db: createFakeDb({
        counts: {
          transaction: 1,
          transactionItem: 1,
          inventoryLog: 1,
          suratJalanItem: 1,
        },
      }),
      storeId: "store-a",
      domains: ["salesFinance"],
    });

    expect(plan.requiredDependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ domain: "inventoryOperations", blocking: true }),
      ]),
    );
  });

  it("orders surat jalan items before transaction items", async () => {
    const plan = await createDatabaseResetPlan({
      db: createFakeDb({
        counts: { transaction: 1, transactionItem: 1, suratJalanItem: 1 },
      }),
      storeId: "store-a",
      domains: ["salesFinance", "inventoryOperations"],
    });

    expect(plan.operations.findIndex((item) => item.model === "SuratJalanItem")).toBeLessThan(
      plan.operations.findIndex((item) => item.model === "TransactionItem"),
    );
  });
});
