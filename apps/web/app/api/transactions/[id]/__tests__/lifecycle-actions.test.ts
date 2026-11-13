import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  handleAuthError: vi.fn(),
  findFirst: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  reverseTransaction: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: mocks.requirePermission,
  handleAuthError: mocks.handleAuthError,
  canAuthenticatedUserPerform: async () => true,
}));
vi.mock("@pos/db", () => ({
  db: {
    transaction: { findFirst: mocks.findFirst, findUniqueOrThrow: mocks.findUniqueOrThrow },
    $transaction: mocks.transaction,
  },
  Prisma: {},
}));
vi.mock("@/features/transactions-stock/services/transaction-reversal-service", () => ({
  reverseTransaction: mocks.reverseTransaction,
  TransactionReversalConflictError: class extends Error {},
}));
vi.mock("@/features/receipt-changes/server/receipt-change-audit", () => ({
  shouldRecordReceiptChange: () => false,
  captureReceiptSnapshot: vi.fn(),
  recordReceiptChange: vi.fn(),
}));

import { DELETE, PATCH } from "../route";
import { buildDefaultRolePermissions, canRolePerformAction, type EditableRole, type ResourceAction } from "@/features/rbac/helpers/rbac-core";

const params = { params: Promise.resolve({ id: "tx-1" }) };
const warning = {
  code: "STOCK_HISTORY_REVIEW_REQUIRED",
  message: "Riwayat stok perlu diperiksa. Nota penawaran tetap dihapus tanpa perkiraan pengembalian stok.",
};

describe("transaction lifecycle API contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermission.mockResolvedValue({ id: "owner-1", role: "OWNER", storeId: "store-1" });
    mocks.handleAuthError.mockReturnValue(null);
    mocks.findFirst.mockResolvedValue({ id: "tx-1", status: "DRAFT", printingSubcategory: null, payments: [] });
    mocks.findUniqueOrThrow.mockResolvedValue({ id: "tx-1", status: "VOIDED" });
    mocks.reverseTransaction.mockResolvedValue("APPLIED");
    mocks.transaction.mockImplementation(async (callback) => callback({}));
  });

  it.each(["DRAFT", "PENDING_APPROVAL", "COMPLETED", "DP"])("voids %s through the central lifecycle service", async (status) => {
    mocks.findFirst.mockResolvedValue({ id: "tx-1", status, payments: [] });
    const response = await PATCH(new Request("http://localhost/api/transactions/tx-1", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "VOIDED" }),
    }), params);
    expect(response.status).toBe(200);
    expect(mocks.requirePermission).toHaveBeenCalledWith("transaction", "update");
    expect(mocks.reverseTransaction).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: "VOID", transactionId: "tx-1", storeId: "store-1",
    }));
  });

  it("returns quotation review warnings after successful deletion", async () => {
    mocks.reverseTransaction.mockImplementation(async (_tx, input) => {
      input.onWarning?.(warning);
      return "APPLIED";
    });
    const response = await DELETE(new Request("http://localhost/api/transactions/tx-1", { method: "DELETE" }), params);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ warnings: [warning] });
    expect(mocks.requirePermission).toHaveBeenCalledWith("transaction", "delete");
  });

  it("retains the empty 204 response when deletion has no warnings", async () => {
    const response = await DELETE(new Request("http://localhost/api/transactions/tx-1", { method: "DELETE" }), params);
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
  });

  it.each(["ADMIN", "CASHIER", "SALES", "INVENTORY"] as const)("honors an explicit transaction.update grant for %s Void", async (role) => {
    const permissions = buildDefaultRolePermissions();
    permissions[role].resources.transaction.update = true;
    mocks.requirePermission.mockImplementation(async (resource: string, action: ResourceAction) => {
      if (!canRolePerformAction(role, resource, action, permissions)) throw new Error("Ditolak RBAC");
      return { id: "granted-user", role, storeId: "store-1" };
    });
    const response = await PATCH(new Request("http://localhost/api/transactions/tx-1", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "VOIDED" }),
    }), params);
    expect(response.status).toBe(200);
    expect(mocks.reverseTransaction).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "VOID" }));
  });

  const deniedCases = (["ADMIN", "CASHIER", "SALES", "INVENTORY"] as const).flatMap((role) =>
    (["update", "delete"] as const).map((action) => ({ role, action })),
  );

  it.each(deniedCases)("denies revoked transaction.$action for $role before touching data", async ({ role, action }) => {
    const permissions = buildDefaultRolePermissions();
    permissions[role].resources.transaction[action] = false;
    const denied = new Error("Ditolak RBAC");
    mocks.requirePermission.mockImplementation(async (resource: string, requestedAction: ResourceAction) => {
      if (!canRolePerformAction(role as EditableRole, resource, requestedAction, permissions)) throw denied;
      return { id: "revoked-user", role, storeId: "store-1" };
    });
    mocks.handleAuthError.mockImplementation((error) => error === denied
      ? Response.json({ message: "Anda tidak memiliki izin untuk tindakan ini." }, { status: 403 })
      : null);
    const request = new Request("http://localhost/api/transactions/tx-1", action === "delete"
      ? { method: "DELETE" }
      : { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "VOIDED" }) });
    const response = action === "delete" ? await DELETE(request, params) : await PATCH(request, params);
    expect(response.status).toBe(403);
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.reverseTransaction).not.toHaveBeenCalled();
  });

  it("keeps the existing role rule for status changes unrelated to Void", async () => {
    mocks.requirePermission.mockResolvedValue({ id: "cashier-1", role: "CASHIER", storeId: "store-1" });
    mocks.findFirst.mockResolvedValue({ id: "tx-1", status: "COMPLETED", payments: [] });
    const response = await PATCH(new Request("http://localhost/api/transactions/tx-1", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "DP" }),
    }), params);
    expect(response.status).toBe(403);
    expect(mocks.reverseTransaction).not.toHaveBeenCalled();
  });
});
