import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  role: vi.fn(), permission: vi.fn(), page: vi.fn(), query: vi.fn(), execute: vi.fn(), transaction: vi.fn(),
  denied: new Error("denied"), unauthenticated: new Error("unauthenticated"),
}));
vi.mock("@/lib/rbac/guard", () => ({
  requireRole: mocks.role,
  requirePermission: mocks.permission,
  authorizeInTransaction: async (_tx: unknown, actor: typeof user, requirements: { resources: { resource: string; action: string }[]; page?: string }) => {
    try {
      if (requirements.page && !await mocks.page()) return false;
      for (const grant of requirements.resources) {
        const current = await mocks.permission(grant.resource, grant.action);
        if (current.id !== actor.id || current.storeId !== actor.storeId || current.role !== actor.role) return false;
      }
      return true;
    } catch { return false; }
  },
  canAuthenticatedUserAccessPage: mocks.page,
  handleAuthError: (error: unknown) => error === mocks.denied
    ? new Response(null, { status: 403 })
    : error === mocks.unauthenticated ? new Response(null, { status: 401 }) : null,
}));
vi.mock("@pos/db", () => ({ db: { $transaction: mocks.transaction } }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ error: vi.fn() }) }));
vi.mock("@/features/keuangan/services/manual-payable-reconciliation", async original => ({ ...await original<object>(), reconcilePayable: async () => ({}) }));

import { POST } from "../../../app/api/finance/supplier-payables/[id]/payments/route";

const user = { id: "user-1", storeId: "store-1", role: "SALES" };
let allowed: Set<string>;
let debt: { amount: string; debtDate: string; goodsPurchaseId: string | null; giroHistoryVerifiedAt: Date | null; ledgerVersion: string; dueDate: string | null };
let writes: unknown[][];
const request = (extra: Record<string, unknown> = {}) => new Request("http://localhost/api/finance/supplier-payables/debt-1/payments", {
  method: "POST",
  headers: { "Content-Type": "application/json", "Idempotency-Key": "b14f880a-fb50-43bc-a2aa-4733c8811dad" },
  body: JSON.stringify({ amount: "300", paidAt: "2026-10-10", expectedBalance: "800", expectedLedgerVersion: "0", ...extra }),
});
const pay = (extra?: Record<string, unknown>) => POST(request(extra), { params: Promise.resolve({ id: "debt-1" }) });

describe("izin pembayaran giro dan hutang manual", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    allowed = new Set(["expense.giro", "expense.payable"]);
    debt = { amount: "1000.00", debtDate: "2026-10-01", goodsPurchaseId: "purchase-1", ledgerVersion: "0", dueDate: null, giroHistoryVerifiedAt: new Date("2026-10-05T00:00:00Z") };
    writes = [];
    mocks.role.mockResolvedValue(user);
    mocks.page.mockResolvedValue(true);
    mocks.permission.mockImplementation(async (resource: string, action: string) => {
      if (!["update", "read"].includes(action) || !allowed.has(resource)) throw mocks.denied;
      return user;
    });
    mocks.query.mockImplementation(async (parts: TemplateStringsArray, ...values: unknown[]) => {
      const sql = parts.join(" ");
      if (sql.includes("FOR UPDATE")) return [debt];
      if (sql.includes("SUM")) return [{ paid: "200.00" }];
      if (sql.includes("INSERT")) { writes.push(values); return [{ id: "payment-1" }]; }
      return [];
    });
    mocks.execute.mockImplementation(async (_parts: TemplateStringsArray, ...values: unknown[]) => { writes.push(values); return 1; });
    mocks.transaction.mockImplementation(async callback => callback({ $queryRaw: (parts: TemplateStringsArray, ...values: unknown[]) => {
      const sql = parts.join(' ');
      if (sql.includes('pg_advisory_xact_lock') || sql.includes('FROM "pos_payable_payment_attempts"')) return Promise.resolve([]);
      if (sql.startsWith('SELECT "id" FROM "pos_goods_purchase_payments"') || sql.startsWith('SELECT "id" FROM "pos_expenses"')) return Promise.resolve([]);
      return mocks.query(parts, ...values);
    }, $executeRaw: (parts: TemplateStringsArray, ...values: unknown[]) => parts.join(' ').includes('LOCK TABLE "pos_goods_purchases"') ? Promise.resolve(0) : mocks.execute(parts, ...values) }));
  });

  it("menerima pembayaran giro dengan izin giro tanpa izin hutang manual", async () => {
    allowed = new Set(["expense.giro"]);
    expect((await pay()).status).toBe(201);
    expect(writes).toHaveLength(1);
  });

  it("mengakui pembayaran manual setelah hutang menjadi giro pada ID yang sama", async () => {
    allowed = new Set(["expense.payable"]);
    mocks.query.mockImplementation(async (parts: TemplateStringsArray, ...values: unknown[]) => {
      const sql = parts.join(" ");
      if (sql.includes("FOR UPDATE")) return [debt];
      if (sql.includes('p."requestScope"')) return [{ createdById: "user-1", payableId: "debt-1", amount: "300", paidAt: "2026-10-10", requestPayableId: "debt-1", requestAmount: "300", requestPaidAt: "2026-10-10", requestExpectedBalance: "800", requestLedgerVersion: "0", requestResource: "MANUAL" }];
      if (sql.includes("INSERT")) writes.push(values);
      return [];
    });
    expect((await pay()).status).toBe(201);
    expect((await pay({ amount: "400" })).status).toBe(409);
    allowed.clear();
    expect((await pay()).status).toBe(403);
    expect(writes).toEqual([]);
  });

  it("tidak memakai izin manual untuk pembayaran giro baru atau replay giro", async () => {
    allowed = new Set(["expense.payable"]);
    expect((await pay()).status).toBe(403);
    mocks.query.mockImplementation(async (parts: TemplateStringsArray) => parts.join(" ").includes("FOR UPDATE") ? [debt] : [{ createdById: "user-1", payableId: "debt-1", amount: "300", paidAt: "2026-10-10", requestPayableId: "debt-1", requestAmount: "300", requestPaidAt: "2026-10-10", requestExpectedBalance: "800", requestLedgerVersion: "0", requestResource: "GIRO" }]);
    expect((await pay()).status).toBe(403);
  });

  it("menolak pembayaran giro ketika hanya izin hutang manual diberikan", async () => {
    allowed = new Set(["expense.payable"]);
    expect((await pay()).status).toBe(403);
    expect(writes).toEqual([]);
  });

  it("menerima pembayaran hutang manual dengan izin hutang tanpa izin giro", async () => {
    debt.goodsPurchaseId = null;
    allowed = new Set(["expense.payable"]);
    expect((await pay()).status).toBe(201);
    expect(writes).toHaveLength(1);
  });

  it("menolak pembayaran hutang manual ketika hanya izin giro diberikan", async () => {
    debt.goodsPurchaseId = null;
    allowed = new Set(["expense.giro"]);
    expect((await pay()).status).toBe(403);
    expect(writes).toEqual([]);
  });
  it("menolak pembayaran manual tanpa izin melihat hutang atau akses halaman Keuangan", async () => {
    debt.goodsPurchaseId = null;
    mocks.page.mockResolvedValueOnce(false);
    expect((await pay()).status).toBe(403);
    mocks.permission.mockImplementation(async (resource: string, action: string) => {
      if (resource === "expense.payable" && action === "read") throw mocks.denied;
      return user;
    });
    expect((await pay()).status).toBe(403);
    expect(writes).toEqual([]);
  });

  it.each([null, "purchase-lain"])("memilih izin giro dari data tersimpan meski body mengirim goodsPurchaseId %s", async goodsPurchaseId => {
    allowed = new Set(["expense.payable"]);
    expect((await pay({ goodsPurchaseId, resource: "expense.payable", storeId: "store-lain" })).status).toBe(403);
    expect(writes).toEqual([]);
  });

  it("membatasi pencarian pada toko sesi sebelum memilih jenis pembayaran", async () => {
    mocks.query.mockResolvedValueOnce([]);
    expect((await pay({ storeId: "store-lain" })).status).toBe(404);
    const parameters = mocks.query.mock.calls[0].slice(1);
    expect(parameters).toContain("debt-1");
    expect(parameters).toContain("store-1");
    expect(parameters).not.toContain("store-lain");
    expect(writes).toEqual([]);
  });

  it("menolak sesi tanpa toko sebelum membaca hutang", async () => {
    mocks.role.mockResolvedValue({ ...user, storeId: null });
    expect((await pay()).status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it("menolak pengguna yang belum masuk sebelum membaca hutang", async () => {
    mocks.role.mockRejectedValue(mocks.unauthenticated);
    expect((await pay()).status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it("membatalkan pembayaran jika toko berubah saat izin diperiksa kembali", async () => {
    mocks.permission.mockResolvedValue({ ...user, storeId: "store-lain" });
    expect((await pay()).status).toBe(403);
    expect(writes).toEqual([]);
  });
});
