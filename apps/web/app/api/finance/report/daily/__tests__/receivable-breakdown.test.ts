import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDefaultRolePermissions } from "@/features/rbac/helpers/rbac-core";

const mocks = vi.hoisted(() => ({ user: vi.fn(), permissions: vi.fn(), transaction: vi.fn(), manual: vi.fn(), receivable: vi.fn(), ledger: vi.fn() }));
vi.mock("@/lib/rbac/guard", () => ({ getCurrentUser: mocks.user, handleAuthError: () => null }));
vi.mock("@/features/rbac/helpers/rbac-server", () => ({ getGlobalRolePermissions: mocks.permissions }));
vi.mock("@pos/db", () => {
  const db = {
  $queryRaw: async () => [],
  transaction: { findMany: mocks.transaction }, manualIncome: { findMany: mocks.manual },
  customerReceivable: { findMany: (query: { select?: { payments?: unknown } }) => query.select?.payments ? mocks.ledger(query) : mocks.receivable(query) },
};
  return { db: { ...db, $transaction: (read: (tx: typeof db) => unknown) => read(db) } };
});
import { GET } from "../route";

describe("saldo piutang pada laporan harian", () => {
  beforeEach(() => {
    vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-11T03:00:00Z"));
    mocks.user.mockResolvedValue({ id: "sales", role: "SALES", storeId: "store-1" });
    mocks.permissions.mockResolvedValue(buildDefaultRolePermissions());
    mocks.transaction.mockImplementation(async query => query.select?.payments ? [] : [{ status: "COMPLETED", paymentMethod: "TEMPO", total: 300, amountPaid: 100 }]);
    mocks.manual.mockResolvedValue([]);
    mocks.receivable.mockResolvedValue([{ amount: 200, amountPaid: 50 }]);
    mocks.ledger.mockResolvedValue([]);
  });
  afterEach(() => vi.useRealTimers());

  it("mengembalikan total serta saldo nota dan manual secara terpisah", async () => {
    const response = await GET(new Request("http://localhost/api/finance/report/daily?date=2026-11-11"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ receivableBalance: 350, receivableNotaBalance: 200, receivableManualBalance: 150 });
  });

  it.each(["transaction", "customer.receivable"])("menyembunyikan semua saldo jika izin %s dicabut", async permission => {
    const permissions = buildDefaultRolePermissions();
    permissions.SALES.resources[permission].read = false;
    mocks.permissions.mockResolvedValue(permissions);
    const body = await (await GET(new Request("http://localhost/api/finance/report/daily?date=2026-11-11"))).json();
    expect(body).not.toHaveProperty("receivableBalance");
    expect(body).not.toHaveProperty("receivableNotaBalance");
    expect(body).not.toHaveProperty("receivableManualBalance");
    expect(mocks.receivable).not.toHaveBeenCalled();
  });
});
