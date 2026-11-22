import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDefaultRolePermissions } from "@/features/rbac/helpers/rbac-core";

const mocks = vi.hoisted(() => ({ user: vi.fn(), permissions: vi.fn(), transactions: vi.fn(), income: vi.fn(), payments: vi.fn(), receivables: vi.fn() }));
vi.mock(import("@/lib/rbac/guard"), async original => ({ ...await original(), getCurrentUser: mocks.user }));
vi.mock("@/features/rbac/helpers/rbac-server", () => ({ getGlobalRolePermissions: mocks.permissions }));
vi.mock("@pos/db", () => {
  const db = { $queryRaw: async () => [],
  transaction: { findMany: mocks.transactions }, manualIncome: { findMany: mocks.income },
  customerReceivablePayment: { findMany: mocks.payments },
  customerReceivable: { findMany: mocks.receivables },
};
  return { db: { ...db, $transaction: (read: (tx: typeof db) => unknown) => read(db) } };
});
import { GET } from "../route";

const request = (extra = "") => new Request(`http://localhost/api/history/receipts?mode=receipt&dateFrom=2026-11-11&dateTo=2026-11-11&method=TRANSFER${extra}`);

describe("rincian metode pembayaran piutang", () => {
  beforeEach(() => {
    vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-11T03:00:00Z"));
    mocks.user.mockResolvedValue({ id: "owner", role: "OWNER", storeId: "store-1" });
    mocks.permissions.mockResolvedValue(buildDefaultRolePermissions());
    mocks.transactions.mockImplementation(async query => query.select?.payments ? [{
      id: "nota-1", createdAt: new Date("2026-11-09T03:00:00Z"), status: "COMPLETED", paymentMethod: "TEMPO",
      total: 100_000, amountPaid: 100_000, change: 0, transactionCategory: "ATK", items: [],
      payments: [{ id: "awal", method: "CASH", amount: 40_000, createdAt: new Date("2026-11-10T03:00:00Z") }],
      debtPaymentLogs: [{ id: "cicilan", paymentMethod: "TRANSFER", amount: 60_000, createdAt: new Date("2026-11-11T03:00:00Z") }],
    }] : [{ id: "nota-1", invoiceNumber: "INV-001" }]);
    mocks.income.mockResolvedValue([]);
    mocks.receivables.mockResolvedValue([
      { id: "r1", amount: 25_000, reportCategory: "ATK", payments: [
        { id: "manual-1", method: "TRANSFER", amount: 25_000, paidAt: null, createdAt: new Date("2026-11-11T04:00:00Z") },
      ] },
      { id: "r2", amount: 10_000, reportCategory: "ATK", payments: [
        { id: "manual-2", method: "CASH", amount: 10_000, paidAt: null, createdAt: new Date("2026-11-11T04:00:00Z") },
      ] },
    ]);
    mocks.payments.mockResolvedValue([
      { id: "manual-1", receivableId: "r1", receivable: { id: "r1", note: null, customer: { name: "Pelanggan Contoh" } } },
    ]);
  });
  afterEach(() => vi.useRealTimers());

  it("menampilkan pembayaran nota dan piutang manual yang cocok dengan metode", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.receiptTotal).toBe(85_000);
    expect(body.items).toEqual([expect.objectContaining({ invoiceNumber: "INV-001", amount: 60_000, isReceivableNota: true })]);
    expect(body.manualReceivableEntries).toEqual([expect.objectContaining({ id: "manual-1", customerName: "Pelanggan Contoh", amount: 25_000, methods: ["TRANSFER"] })]);
    expect(body.manualReceivableDetailsAvailable).toBe(true);
    expect(mocks.payments.mock.calls[0][0].where).toMatchObject({ receivable: { storeId: "store-1" }, id: { in: ["manual-1"] } });
  });

  it.each(["permission", "page"])("tidak membocorkan identitas saat akses piutang manual %s dicabut", async denied => {
    const permissions = buildDefaultRolePermissions();
    if (denied === "permission") permissions.SALES.resources["customer.receivable"].read = false;
    else permissions.SALES.pages["/customers"] = false;
    mocks.permissions.mockResolvedValue(permissions);
    mocks.user.mockResolvedValue({ id: "sales", role: "SALES", storeId: "store-1" });
    const response = await GET(request());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.manualReceivableDetailsAvailable).toBe(false);
    expect(body.manualReceivableEntries).toBeUndefined();
    expect(body.receiptTotal).toBe(85_000);
    expect(JSON.stringify(body)).not.toContain("Pelanggan Contoh");
    expect(mocks.receivables).toHaveBeenCalledOnce();
    expect(mocks.payments).not.toHaveBeenCalled();
  });

  it("memakai izin Sales saat Owner membuka pratinjau", async () => {
    const permissions = buildDefaultRolePermissions();
    permissions.SALES.resources["customer.receivable"].read = false;
    mocks.permissions.mockResolvedValue(permissions);
    const body = await (await GET(request("&view=sales"))).json();
    expect(body.manualReceivableDetailsAvailable).toBe(false);
    expect(body.manualReceivableEntries).toBeUndefined();
  });
});
