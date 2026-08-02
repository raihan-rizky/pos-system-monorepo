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
});
