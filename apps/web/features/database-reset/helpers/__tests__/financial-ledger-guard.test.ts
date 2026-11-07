import { describe, expect, it, vi } from "vitest";
import { createDatabaseResetPlan } from "../database-reset-plan";
import type { DatabaseResetReadClient } from "../../types/database-reset";

function database(input: { payableStore?: string; giroExpenseStore?: string; backdatedExpenseStore?: string } = {}) {
  const payableCount = vi.fn(async ({ where }: { where: { goodsPurchase?: { is?: { storeId?: string } } } }) =>
    Number(Boolean(input.payableStore && where.goodsPurchase?.is?.storeId === input.payableStore)));
  const expenseCount = vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
    if (!Array.isArray(where.OR)) return 0;
    const giro = where.OR.some((item: Record<string, unknown>) => "goodsPurchase" in item || "shoppingRequest" in item);
    const backdated = where.OR.some((item: Record<string, unknown>) => "backdatedPurchaseDueId" in item || "backdatedPurchasePaymentId" in item);
    return Number((giro && where.storeId === input.giroExpenseStore) || (backdated && where.storeId === input.backdatedExpenseStore));
  });
  const db = new Proxy({}, { get(_target, name: string) {
    if (name === "supplierPayable") return { count: payableCount };
    if (name === "expense") return { count: expenseCount };
    return { count: vi.fn(async () => 0) };
  } }) as DatabaseResetReadClient;
  return { db, payableCount, expenseCount };
}

describe("database reset protects financial ledgers", () => {
  it.each([{ models: ["GoodsPurchase", "Expense"] as const }, { domains: ["supplierProcurement", "salesFinance"] as const }])(
    "blocks a purchase with a protected payable for selection %j", async selection => {
      const { db, payableCount } = database({ payableStore: "store-a" });
      const plan = await createDatabaseResetPlan({ db, storeId: "store-a", ...selection });
      expect(plan.canExecute).toBe(false);
      expect(plan.requiredDependencies).toContainEqual(expect.objectContaining({ blocking: true, reason: expect.stringMatching(/hutang|giro/i) }));
      expect(payableCount).toHaveBeenCalledWith({ where: { goodsPurchase: { is: { storeId: "store-a" } } } });
      expect(plan.operations.map(item => item.model)).not.toContain("SupplierPayable");
    },
  );

  it("blocks removal of the active expense that connects a giro to its payable", async () => {
    const { db, expenseCount } = database({ giroExpenseStore: "store-a" });
    const plan = await createDatabaseResetPlan({ db, storeId: "store-a", models: ["Expense"] });
    expect(plan.canExecute).toBe(false);
    expect(plan.requiredDependencies).toContainEqual(expect.objectContaining({ blocking: true, reason: expect.stringMatching(/giro/i) }));
    const giroPurchase = { storeId: "store-a", OR: [
      { payments: { some: { method: "GIRO" } } },
      { payments: { none: {} }, paymentMethod: "GIRO" },
    ] };
    expect(expenseCount).toHaveBeenCalledWith({ where: {
      storeId: "store-a", deletedAt: null, OR: [
        { goodsPurchase: { is: giroPurchase } },
        { goodsPurchaseId: null, shoppingRequest: { is: { storeId: "store-a", goodsPurchases: { some: giroPurchase } } } },
      ],
    } });
  });

  it("blocks deletion of active expenses synchronized from a backdated purchase", async () => {
    const { db, expenseCount } = database({ backdatedExpenseStore: "store-a" });
    const plan = await createDatabaseResetPlan({ db, storeId: "store-a", models: ["Expense"] });
    expect(plan.canExecute).toBe(false);
    expect(plan.requiredDependencies).toContainEqual(expect.objectContaining({ blocking: true, reason: expect.stringMatching(/belanja terdahulu/i) }));
    expect(expenseCount).toHaveBeenCalledWith({ where: { storeId: "store-a", deletedAt: null, OR: [
      { backdatedPurchaseDueId: { not: null } }, { backdatedPurchasePaymentId: { not: null } },
    ] } });
  });

  it("does not block unrelated store data or unrelated selected models", async () => {
    const { db } = database({ payableStore: "store-b", giroExpenseStore: "store-b", backdatedExpenseStore: "store-b" });
    const protectedSelection = await createDatabaseResetPlan({ db, storeId: "store-a", models: ["Expense", "GoodsPurchase"] });
    expect(protectedSelection.canExecute).toBe(true);
    const unrelatedSelection = await createDatabaseResetPlan({ db, storeId: "store-b", models: ["ProductPriceLog"] });
    expect(unrelatedSelection.canExecute).toBe(true);
    expect(unrelatedSelection.operations.map(item => item.model)).toEqual(["ProductPriceLog"]);
  });

  it.each([
    { models: ["Transaction", "PrintingReceipt", "Expense"] as const },
    { domains: ["salesFinance"] as const },
  ])("keeps the giro guard while allowing printing receipts to precede transactions (%j)", async selection => {
    const { db } = database({ giroExpenseStore: "store-a" });
    const plan = await createDatabaseResetPlan({ db, storeId: "store-a", ...selection });
    expect(plan.canExecute).toBe(false);
    expect(plan.requiredDependencies).toContainEqual(expect.objectContaining({ model: "Expense", blocking: true, reason: expect.stringMatching(/giro/i) }));
    const names = plan.operations.map(item => item.model);
    expect(names).toContain("PrintingReceipt");
    expect(names.indexOf("PrintingReceipt")).toBeLessThan(names.indexOf("Transaction"));
  });

  it("allows a printing-receipt-only reset when financial ledgers are protected", async () => {
    const { db } = database({ payableStore: "store-a", giroExpenseStore: "store-a", backdatedExpenseStore: "store-a" });
    const plan = await createDatabaseResetPlan({ db, storeId: "store-a", models: ["PrintingReceipt"] });
    expect(plan.canExecute).toBe(true);
    expect(plan.operations.map(item => item.model)).toEqual(["PrintingReceipt"]);
    expect(plan.preserved).not.toContainEqual(expect.objectContaining({ model: "Nota Percetakan" }));
    expect(plan.preserved).toContainEqual(expect.objectContaining({ model: "Penomoran Nota Percetakan" }));
  });
});
