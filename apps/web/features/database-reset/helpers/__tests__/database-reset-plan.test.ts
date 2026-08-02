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
