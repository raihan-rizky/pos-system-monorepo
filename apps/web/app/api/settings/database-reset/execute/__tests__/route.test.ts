import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";
import type { DatabaseResetPlan } from "@/features/database-reset/types/database-reset";

const requireRoleMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const createDatabaseResetPlanMock = vi.hoisted(() => vi.fn());
const executeDatabaseResetPlanMock = vi.hoisted(() => vi.fn());
const dbMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  cashierShift: { count: vi.fn() },
  productImportJob: { count: vi.fn() },
  batchOperation: { count: vi.fn() },
}));

vi.mock("@/lib/rbac/guard", () => ({
  AuthError: class AuthError extends Error {
    statusCode: number;

    constructor(statusCode: number, message?: string) {
      super(message || "auth");
      this.statusCode = statusCode;
    }
  },
  requireRole: requireRoleMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@/features/database-reset/helpers/database-reset-plan", () => ({
  createDatabaseResetPlan: createDatabaseResetPlanMock,
  executeDatabaseResetPlan: executeDatabaseResetPlanMock,
}));

vi.mock("@pos/db", () => ({ db: dbMock }));
vi.mock("@/lib/logger", () => ({
  getLogger: () => ({ error: vi.fn() }),
}));

const ownerUser = { id: "owner-1", role: "OWNER", storeId: "store-a" };
const executablePlan: DatabaseResetPlan = {
  storeId: "store-a",
  domains: ["salesFinance"],
  operations: [],
  cascades: [],
  requiredDependencies: [],
  preserved: [],
  canExecute: true,
};

function requestWith(body: unknown) {
  return new Request("http://localhost/api/settings/database-reset/execute", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/settings/database-reset/execute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requireRoleMock.mockResolvedValue(ownerUser);
    createDatabaseResetPlanMock.mockResolvedValue(executablePlan);
    executeDatabaseResetPlanMock.mockResolvedValue({
      deleted: [{ model: "Transaction", count: 2 }],
      executedAt: "2026-08-02T00:00:00.000Z",
    });
    dbMock.cashierShift.count.mockResolvedValue(0);
    dbMock.productImportJob.count.mockResolvedValue(0);
    dbMock.batchOperation.count.mockResolvedValue(0);
  });

  it("rejects a confirmation phrase that is not exact", async () => {
    const response = await POST(requestWith({
      domains: ["salesFinance"],
      confirmation: "reset database",
    }));

    expect(response.status).toBe(422);
    expect(dbMock.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a plan with a missing required dependency", async () => {
    createDatabaseResetPlanMock.mockResolvedValue({
      ...executablePlan,
      canExecute: false,
      requiredDependencies: [{ domain: "inventoryOperations", reason: "required", blocking: true }],
    });

    const response = await POST(requestWith({
      domains: ["salesFinance"],
      confirmation: "RESET DATABASE",
    }));

    expect(response.status).toBe(409);
    expect(dbMock.$transaction).not.toHaveBeenCalled();
  });

  it("blocks execution while the current store has an open shift", async () => {
    dbMock.cashierShift.count.mockResolvedValue(1);

    const response = await POST(requestWith({
      domains: ["salesFinance"],
      confirmation: "RESET DATABASE",
    }));

    expect(response.status).toBe(409);
    expect(dbMock.$transaction).not.toHaveBeenCalled();
  });

  it("executes the plan in one transaction and returns its summary", async () => {
    const txMock = {};
    dbMock.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback(txMock));

    const response = await POST(requestWith({
      domains: ["salesFinance"],
      confirmation: "RESET DATABASE",
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.deleted).toEqual([{ model: "Transaction", count: 2 }]);
    expect(executeDatabaseResetPlanMock).toHaveBeenCalledWith(txMock, executablePlan);
  });

  it("returns 500 when the transaction rejects", async () => {
    dbMock.$transaction.mockRejectedValue(new Error("database unavailable"));

    const response = await POST(requestWith({
      domains: ["salesFinance"],
      confirmation: "RESET DATABASE",
    }));

    expect(response.status).toBe(500);
  });

  it.each(["ProductPriceLog", "PrintingReceipt"])("executes the exact %s selection for the owner store", async model => {
    dbMock.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({}));
    const response = await POST(requestWith({ models: [model], confirmation: "RESET DATABASE", storeId: "other-store" }));
    expect(response.status).toBe(200);
    expect(createDatabaseResetPlanMock).toHaveBeenCalledWith({ db: dbMock, storeId: "store-a", models: [model] });
  });

  it("rejects an empty or ambiguous sub-data selection before deleting anything", async () => {
    for (const selection of [{ models: [] }, { models: ["TransactionPayment"] }, { domains: ["productCatalog"], models: ["ProductPriceLog"] }]) {
      expect((await POST(requestWith({ ...selection, confirmation: "RESET DATABASE" }))).status).toBe(422);
    }
    expect(dbMock.$transaction).not.toHaveBeenCalled();
  });

  it("checks the latest ledger state under locks before deleting expenses", async () => {
    const selected = { ...executablePlan, models: ["Expense"], operations: [{ model: "Expense", domain: "salesFinance", mode: "selected", reason: "Pengeluaran", count: 1, where: { storeId: "store-a" } }] };
    const blocked = { ...selected, canExecute: false, requiredDependencies: [{ domain: "salesFinance", model: "Expense", blocking: true, reason: "Pengeluaran terhubung giro yang dilindungi." }] };
    const tx = { $executeRaw: vi.fn().mockResolvedValue(0) };
    createDatabaseResetPlanMock.mockResolvedValueOnce(selected).mockResolvedValueOnce(blocked);
    dbMock.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback(tx));

    const response = await POST(requestWith({ models: ["Expense"], confirmation: "RESET DATABASE" }));
    expect(response.status).toBe(409);
    expect((await response.json()).requiredDependencies).toEqual(blocked.requiredDependencies);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(3);
    expect(tx.$executeRaw.mock.calls[0][0].join("")).toMatch(/lock_timeout.*3s/i);
    expect(tx.$executeRaw.mock.calls[1][0].join("")).toMatch(/pos_goods_purchases.*EXCLUSIVE MODE/i);
    expect(tx.$executeRaw.mock.calls[1][0].join("")).not.toMatch(/SHARE ROW EXCLUSIVE/i);
    expect(tx.$executeRaw.mock.calls[2][0].join("")).toMatch(/pos_expenses.*pos_supplier_payables.*SHARE ROW EXCLUSIVE MODE/i);
    expect(createDatabaseResetPlanMock).toHaveBeenLastCalledWith({ db: tx, storeId: "store-a", models: ["Expense"] });
    expect(tx.$executeRaw.mock.invocationCallOrder[2]).toBeLessThan(createDatabaseResetPlanMock.mock.invocationCallOrder[1]);
    expect(executeDatabaseResetPlanMock).not.toHaveBeenCalled();
  });

  it("returns a clear conflict when acquiring the reset locks times out", async () => {
    createDatabaseResetPlanMock.mockResolvedValue({ ...executablePlan, operations: [{ model: "Expense", domain: "salesFinance", mode: "selected", reason: "Pengeluaran", count: 1, where: { storeId: "store-a" } }] });
    dbMock.$transaction.mockRejectedValue({ code: "P2010", meta: { code: "55P03" } });
    const response = await POST(requestWith({ models: ["Expense"], confirmation: "RESET DATABASE" }));
    expect(response.status).toBe(409);
    expect((await response.json()).message).toMatch(/sedang digunakan/i);
    expect(executeDatabaseResetPlanMock).not.toHaveBeenCalled();
  });

  it("does not take ledger locks for unrelated reset selections", async () => {
    const tx = { $executeRaw: vi.fn() };
    createDatabaseResetPlanMock.mockResolvedValue({ ...executablePlan, operations: [{ model: "ProductPriceLog", domain: "productCatalog", mode: "selected", reason: "Riwayat Harga", count: 1, where: { storeId: "store-a" } }] });
    dbMock.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback(tx));
    const response = await POST(requestWith({ models: ["ProductPriceLog"], confirmation: "RESET DATABASE" }));
    expect(response.status).toBe(200);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
});
