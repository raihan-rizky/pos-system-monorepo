import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  permission: vi.fn(), page: vi.fn(), authError: vi.fn(), query: vi.fn(), execute: vi.fn(), transaction: vi.fn(), reconcile: vi.fn(),
}));
vi.mock("@pos/db", () => ({ db: { $queryRaw: mocks.query, $transaction: mocks.transaction } }));
vi.mock("@/lib/rbac/guard", () => ({ requireRole: async () => ({ id: "user-1", storeId: "store-1" }), requirePermission: mocks.permission, authorizeInTransaction: async (_tx: unknown, _actor: unknown, requirements: { resources: { resource: string; action: string }[] }) => { try { for (const grant of requirements.resources) await mocks.permission(grant.resource, grant.action); return true; } catch { return false; } }, canAuthenticatedUserAccessPage: mocks.page, handleAuthError: mocks.authError }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ error: vi.fn() }) }));
vi.mock("@/features/keuangan/services/manual-payable-reconciliation", async original => ({ ...await original<object>(), reconcilePayable: mocks.reconcile }));

import { GET, POST } from "../route";
import { POST as pay } from "../[id]/payments/route";
import { parsePayable } from "@/features/keuangan/helpers/supplier-payable-input";

const request = (body: unknown) => new Request("http://localhost/api/finance/supplier-payables", {
  method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": "b14f880a-fb50-43bc-a2aa-4733c8811dad" }, body: JSON.stringify(body),
});
const paymentRequest = (body: Record<string, unknown>) => new Request("http://localhost/api/finance/supplier-payables/debt-1/payments", {
  method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": "b14f880a-fb50-43bc-a2aa-4733c8811dad" },
  body: JSON.stringify({ expectedBalance: "800", expectedLedgerVersion: "0", ...body }),
});
const context = { params: Promise.resolve({ id: "debt-1" }) };
const debt = { supplierName: "Pemasok", amount: "1000", debtDate: "2026-10-01", dueDate: "", note: "", reportCategory: "ATK" };

describe("supplier payable endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-20T03:00:00Z"));
    mocks.permission.mockResolvedValue({ id: "user-1", storeId: "store-1" });
    mocks.page.mockResolvedValue(true);
    mocks.authError.mockReturnValue(null);
    mocks.transaction.mockImplementation(async callback => callback({ $queryRaw: (parts: TemplateStringsArray, ...values: unknown[]) => {
      const sql = parts.join(' ');
      if (sql.includes('pg_advisory_xact_lock') || sql.includes('FROM "pos_payable_payment_attempts"')) return Promise.resolve([]);
      return mocks.query(parts, ...values);
    }, $executeRaw: mocks.execute }));
    mocks.execute.mockResolvedValue(1);
    mocks.reconcile.mockResolvedValue({});
  });
  afterEach(() => vi.useRealTimers());

  it("lists store debt and returns numeric totals", async () => {
    mocks.query.mockResolvedValue([{ id: "d", supplierName: "Pemasok", amount: "1000.00", paid: "200.50", debtDate: "2026-10-01", dueDate: null, note: null, reportCategory: "ATK", total: 1n }]);
    const response = await GET(new Request("http://localhost/api/finance/supplier-payables?page=1&storeId=other"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toMatchObject({ total: 1, items: [{ amount: 1000, paid: 200.5, reportCategory: "ATK" }] });
    expect(mocks.query.mock.calls[0][0].join(" ")).toContain('d."reportCategory"');
    expect(mocks.query.mock.calls[0]).toContain("store-1");
    expect(mocks.query.mock.calls[0]).not.toContain("other");
  });

  it("excludes debts linked to giro from the manual supplier debt list", async () => {
    const manual = { id: 'manual', supplierName: 'Pemasok', amount: '1000.00', paid: '0.00', debtDate: '2026-10-01', dueDate: null, note: null, total: 1n };
    const linked = { ...manual, id: 'giro', total: 2n };
    mocks.query.mockImplementationOnce((query: TemplateStringsArray) =>
      Promise.resolve(query.join(' ').includes('d."goodsPurchaseId" IS NULL') ? [manual] : [manual, linked]));
    const response = await GET(new Request('http://localhost/api/finance/supplier-payables'));
    expect((await response.json()).items.map((item: { id: string }) => item.id)).toEqual(['manual']);
  });

  it("treats the remaining manual debt as paid once its due date arrives in Jakarta", async () => {
    mocks.query.mockImplementationOnce((query: TemplateStringsArray, ...values: unknown[]) => {
      const sql = query.join(' ');
      const automaticallyPaid = sql.includes('d."dueDate" <=') && values.includes('2026-10-20');
      return Promise.resolve([{ id: 'due', supplierName: 'Pemasok', amount: '1000', paid: automaticallyPaid ? '1000' : '250', debtDate: '2026-10-01', dueDate: '2026-10-20', note: null, reportCategory: 'ATK', total: 1n }]);
    });
    const response = await GET(new Request('http://localhost/api/finance/supplier-payables'));
    expect((await response.json()).items[0].paid).toBe(1000);
  });

  it("returns actual payments and the automatically projected remainder in payment history", async () => {
    mocks.query.mockResolvedValueOnce([{ id: 'due', supplierName: 'Pemasok', amount: '1000', paid: '1000', debtDate: '2026-10-01', dueDate: '2026-10-10', note: null, reportCategory: 'ATK', total: 1n,
      payments: [{ id: 'late', amount: '400', paidAt: '2026-10-15', origin: 'MANUAL' }] }]);
    const response = await GET(new Request('http://localhost/api/finance/supplier-payables'));
    expect((await response.json()).items[0].payments).toEqual([
      { id: 'auto:due', amount: 600, paidAt: '2026-10-10', origin: 'AUTO', allocated: false },
      { id: 'late', amount: 400, paidAt: '2026-10-15', origin: 'MANUAL', allocated: false },
    ]);
    expect(mocks.query.mock.calls[0][0].join(' ')).toContain('json_agg');
  });
  it("menandai pembayaran yang sudah ditautkan agar tidak dipilih untuk transfer lain", async () => {
    mocks.query.mockResolvedValueOnce([{ id: 'debt', supplierName: 'Pemasok', amount: '1000', paid: '400', debtDate: '2026-10-01', dueDate: null, note: null, reportCategory: 'ATK', total: 1n,
      payments: [{ id: 'p1', amount: '400', paidAt: '2026-10-10', origin: 'MANUAL', allocated: true }] }]);
    const response = await GET(new Request('http://localhost/api/finance/supplier-payables'));
    expect((await response.json()).items[0].payments[0]).toMatchObject({ id: 'p1', allocated: true });
    expect(mocks.query.mock.calls[0][0].join(' ')).toContain('pos_manual_transfer_allocations');
  });

  it("returns the remaining total when a page becomes empty after a debt is linked to a giro", async () => {
    mocks.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: 20n }]);
    const response = await GET(new Request("http://localhost/api/finance/supplier-payables?page=2&storeId=other"));

    expect(await response.json()).toEqual({ items: [], page: 2, total: 20 });
    const [query, ...values] = mocks.query.mock.calls[1];
    expect(query.join(" ")).toContain('"goodsPurchaseId" IS NULL');
    expect(values).toContain("store-1");
    expect(values).not.toContain("other");
  });

  it("saves a debt and its optional initial payment together", async () => {
    mocks.query.mockResolvedValueOnce([{ key: "b14f880a-fb50-43bc-a2aa-4733c8811dad", body: JSON.stringify(parsePayable({ ...debt, initialPayment: "250", initialPaidAt: "2026-10-02" })), completedAt: null }]).mockResolvedValueOnce([]);
    const response = await POST(request({ ...debt, initialPayment: "250", initialPaidAt: "2026-10-02" }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: expect.any(String) });
    const insert = mocks.execute.mock.calls.find(call => call[0].join(" ").includes('INSERT INTO "pos_supplier_payables"'))!;
    expect(insert[0].join(" ")).toContain('"reportCategory"');
    expect(insert).toContain("ATK");
    expect(mocks.execute.mock.calls.filter(call => call[0].join(" ").includes('INSERT INTO "pos_supplier_payable_payments"'))).toHaveLength(1);
    expect(mocks.permission).toHaveBeenCalledWith("expense.payable", "create");
  });
  it("memerlukan izin membaca dan mencatat pembayaran untuk pembayaran awal", async () => {
    mocks.permission.mockImplementation(async (target: string, action: string) => {
      if (target === 'expense.payable' && action === 'update') throw new Error('denied');
      return { id: 'user-1', storeId: 'store-1' };
    });
    mocks.authError.mockImplementation((error: unknown) => error instanceof Error && error.message === 'denied' ? new Response(null, { status: 403 }) : null);
    expect((await POST(request({ ...debt, initialPayment: '250', initialPaidAt: '2026-10-02' }))).status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects invalid or missing-store debts before writing", async () => {
    expect((await POST(request({ ...debt, initialPayment: "1001", initialPaidAt: "2026-10-02" }))).status).toBe(422);
    expect((await POST(request({ ...debt, reportCategory: "" }))).status).toBe(422);
    mocks.permission.mockResolvedValueOnce({ id: "user-1", storeId: null });
    expect((await POST(request(debt))).status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("records a partial payment against the outstanding balance", async () => {
    mocks.query.mockResolvedValueOnce([{ amount: "1000.00", debtDate: "2026-10-01", ledgerVersion: "0" }]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ paid: "200.00" }]).mockResolvedValueOnce([{ id: "payment-1" }]);
    const response = await pay(paymentRequest({ amount: "300", paidAt: "2026-10-10" }), context);
    expect(response.status).toBe(201);
    expect(mocks.query.mock.calls[3][0].join(" ")).toContain('INSERT INTO "pos_supplier_payable_payments"');
    expect(mocks.query.mock.calls[0]).toContain("store-1");
    expect(mocks.permission).toHaveBeenCalledWith("expense.payable", "update");
    expect(mocks.query.mock.calls[2][0].join(" ")).toContain('p."origin" <> \'AUTO\'');
    expect(mocks.reconcile).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ storeId: "store-1", payableId: "debt-1", actorId: "user-1", todayWib: "2026-10-20" }));
    expect(mocks.query.mock.invocationCallOrder[3]).toBeLessThan(mocks.reconcile.mock.invocationCallOrder[0]);
  });

  it("requires payment correction permission before replacing an overdue automatic settlement", async () => {
    mocks.query.mockResolvedValueOnce([{ amount: "1000.00", debtDate: "2026-10-01", dueDate: "2026-10-05", goodsPurchaseId: null, ledgerVersion: "0" }])
      .mockResolvedValueOnce([]).mockResolvedValueOnce([{ paid: "200.00" }]);
    mocks.permission.mockImplementation(async (target: string) => {
      if (target === "expense.payable.manual.payment") throw new Error("denied");
      return { id: "user-1", storeId: "store-1" };
    });
    mocks.authError.mockImplementation((error: unknown) => error instanceof Error && error.message === "denied" ? new Response(null, { status: 403 }) : null);
    expect((await pay(paymentRequest({ amount: "300", paidAt: "2026-10-10", expectedLedgerVersion: "1" }), context)).status).toBe(403);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("rejects overpayment, payments before the debt date, and unknown debts", async () => {
    mocks.query.mockResolvedValueOnce([{ amount: "1000.00", debtDate: "2026-10-01", ledgerVersion: "0" }]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ paid: "200.00" }]);
    expect((await pay(paymentRequest({ amount: "800.01", paidAt: "2026-10-10" }), context)).status).toBe(422);
    mocks.query.mockResolvedValueOnce([{ amount: "1000.00", debtDate: "2026-10-01", ledgerVersion: "0" }]).mockResolvedValueOnce([]);
    expect((await pay(paymentRequest({ amount: "1", paidAt: "2026-09-30" }), context)).status).toBe(422);
    mocks.query.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    expect((await pay(paymentRequest({ amount: "1", paidAt: "2026-10-10" }), context)).status).toBe(404);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("returns an authorization failure without querying data", async () => {
    mocks.permission.mockRejectedValueOnce(new Error("unauthorized"));
    mocks.authError.mockReturnValueOnce(new Response("", { status: 401 }));
    expect((await GET(new Request("http://localhost/api/finance/supplier-payables"))).status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("menolak membaca atau membuat hutang tanpa akses halaman Keuangan", async () => {
    mocks.page.mockResolvedValue(false);
    expect((await GET(new Request("http://localhost/api/finance/supplier-payables"))).status).toBe(403);
    expect((await POST(request(debt))).status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
