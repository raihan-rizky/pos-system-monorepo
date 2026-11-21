import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ permission: vi.fn(), authError: vi.fn(), query: vi.fn(), execute: vi.fn(), transaction: vi.fn() }));
vi.mock("@pos/db", () => ({ db: { $transaction: mocks.transaction } }));
vi.mock("@/lib/rbac/guard", () => ({ requireRole: async () => ({ id: "user-1", storeId: "store-1" }), requirePermission: mocks.permission, authorizeInTransaction: async () => true, handleAuthError: mocks.authError }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ error: vi.fn() }) }));

import { POST } from "../[id]/payments/route";

const request = () => new Request("http://localhost/api/finance/supplier-payables/debt-1/payments", {
  method: "POST",
  headers: { "Content-Type": "application/json", "Idempotency-Key": "b14f880a-fb50-43bc-a2aa-4733c8811dad" },
  body: JSON.stringify({ amount: 300, paidAt: "2026-10-10", expectedBalance: "800", expectedLedgerVersion: "0" }),
});
const context = { params: Promise.resolve({ id: "debt-1" }) };

describe("giro payment guard", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.permission.mockResolvedValue({ id: "user-1", storeId: "store-1" });
    mocks.authError.mockReturnValue(null);
    mocks.execute.mockResolvedValue(1);
    mocks.transaction.mockImplementation(async callback => callback({ $queryRaw: (parts: TemplateStringsArray, ...values: unknown[]) => {
      const sql = parts.join(' ');
      if (sql.includes('pg_advisory_xact_lock') || sql.includes('FROM "pos_payable_payment_attempts"')) return Promise.resolve([]);
      if (sql.startsWith('SELECT "id" FROM "pos_goods_purchase_payments"') || sql.startsWith('SELECT "id" FROM "pos_expenses"')) return Promise.resolve([]);
      return mocks.query(parts, ...values);
    }, $executeRaw: (parts: TemplateStringsArray, ...values: unknown[]) => parts.join(' ').includes('LOCK TABLE "pos_goods_purchases"') ? Promise.resolve(0) : mocks.execute(parts, ...values) }));
  });

  it("requires an unverified giro history to be reviewed before accepting a payment", async () => {
    mocks.query.mockResolvedValueOnce([{ amount: "1000.00", debtDate: "2026-10-01", goodsPurchaseId: "purchase-1", ledgerVersion: "0", giroHistoryVerifiedAt: null }])
      .mockResolvedValueOnce([]);
    const response = await POST(request(), context);
    expect(response.status).toBe(409);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("allows a verified giro payment using the existing balance check", async () => {
    mocks.query.mockResolvedValueOnce([{ amount: "1000.00", debtDate: "2026-10-01", goodsPurchaseId: "purchase-1", ledgerVersion: "0", giroHistoryVerifiedAt: new Date("2026-10-05T00:00:00Z") }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ paid: "200.00" }])
      .mockResolvedValueOnce([{ id: "payment-1" }]);
    const response = await POST(request(), context);
    expect(response.status).toBe(201);
    expect(mocks.query).toHaveBeenCalledTimes(4);
  });
});
