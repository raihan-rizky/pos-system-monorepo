import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), authError: vi.fn(), query: vi.fn(), execute: vi.fn(), transaction: vi.fn(), paymentState: vi.fn() }));
vi.mock("@pos/db", () => ({ db: { $transaction: mocks.transaction } }));
vi.mock("@/lib/rbac/guard", () => ({ requireRole: async () => ({ id: "user-1", storeId: "store-1", role: "OWNER" }), authorizeInTransaction: mocks.authorize, handleAuthError: mocks.authError }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ error: vi.fn() }) }));
vi.mock("@/features/suppliers/shopping-requests/repositories/shopping-request-correction-payment-state", () => ({ loadCorrectionPaymentState: mocks.paymentState }));

import { POST } from "../[id]/payments/route";

const context = { params: Promise.resolve({ id: "debt-1" }) };
const request = (amount: string) => new Request("http://localhost/api/finance/supplier-payables/debt-1/payments", {
  method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": "b14f880a-fb50-43bc-a2aa-4733c8811dad" },
  body: JSON.stringify({ amount, paidAt: "2026-11-21", expectedBalance: "100000", expectedLedgerVersion: "4" }),
});

describe("pembayaran giro dengan catatan bertanggal mendatang", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-21T03:00:00Z"));
    mocks.authorize.mockResolvedValue(true);
    mocks.authError.mockReturnValue(null);
    mocks.transaction.mockImplementation(async callback => callback({ $queryRaw: mocks.query, $executeRaw: mocks.execute }));
    mocks.paymentState.mockResolvedValue({ paid: "60000.00", sources: [{ paymentId: "expense-1", sourceKind: "TRANSFER_EXPENSE", amount: "60000.00", paidAt: "2026-12-05" }] });
    mocks.query.mockImplementation(async (parts: TemplateStringsArray) => {
      const sql = parts.join("?");
      if (sql.includes("WITH payable_hint")) {
        return [{ amount: "100000", debtDate: "2026-11-01", dueDate: null, goodsPurchaseId: "purchase-1", ledgerVersion: "2", giroHistoryVerifiedAt: new Date() }];
      }
      if (sql.includes('AS "paidAsOf"')) {
        return [{ paid: "0", paidAsOf: "0", credited: "0", financeCancelled: false, corrected: true, purchaseMethod: "GIRO" }];
      }
      if (sql.includes('INSERT INTO "pos_supplier_payable_payments"')) return [{ id: "new-payment" }];
      return [];
    });
  });
  afterEach(() => vi.useRealTimers());

  it("menerima saldo hari ini dan nominal yang masih tersedia setelah catatan mendatang", async () => {
    expect((await POST(request("40000"), context)).status).toBe(201);
  });

  it("menolak nominal yang melampaui sisa setelah catatan mendatang", async () => {
    expect((await POST(request("40001"), context)).status).toBe(422);
  });
});
