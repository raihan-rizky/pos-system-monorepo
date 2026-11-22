import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildDefaultRolePermissions } from "@/features/rbac/helpers/rbac-core";
const mocks = vi.hoisted(() => ({ user: vi.fn(), permissions: vi.fn(), transactions: vi.fn(), manual: vi.fn(), receivablePayments: vi.fn() }));
vi.mock(import("@/lib/rbac/guard"), async original => ({ ...await original(), getCurrentUser: mocks.user }));
vi.mock("@/features/rbac/helpers/rbac-server", () => ({ getGlobalRolePermissions: mocks.permissions }));
vi.mock("@pos/db", () => {
  const db = { $queryRaw: async () => [], transaction: { findMany: mocks.transactions }, manualIncome: { findMany: mocks.manual }, customerReceivablePayment: { findMany: mocks.receivablePayments }, customerReceivable: { findMany: async () => [] } };
  return { db: { ...db, $transaction: (read: (tx: typeof db) => unknown) => read(db) } };
});
import { GET } from "../route";
const at = new Date("2026-09-02T03:00:00Z");
const invoice = { id: "old", createdAt: at, status: "COMPLETED", total: 100, amountPaid: 100, change: 0, paymentMethod: "CASH", transactionCategory: null, printingSubcategory: null, items: [], payments: [{ id: "p", method: "CASH", amount: 100, createdAt: at }], debtPaymentLogs: [] };
const query = new URLSearchParams({ mode: "receipt", dateFrom: "2026-09-02", dateTo: "2026-09-02", category: "Belum ditentukan", subcategory: "Belum ditentukan" });
const request = () => new Request(`http://localhost/api/history/receipts?${query}`);

describe("Riwayat pemasukan tanpa kategori", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.user.mockResolvedValue({ id: "sales", role: "SALES", storeId: "store-1" });
    mocks.permissions.mockResolvedValue(buildDefaultRolePermissions());
    mocks.transactions.mockImplementation(async input => input.select?.payments ? [invoice] : [{ id: "old", invoiceNumber: "INV-LAMA" }]);
    mocks.manual.mockResolvedValue([]);
    mocks.receivablePayments.mockResolvedValue([]);
  });
  it("menemukan nominal dengan filter kategori dan subkategori yang belum ditentukan", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect((await response.json()).items).toEqual([expect.objectContaining({ transactionId: "old", invoiceNumber: "INV-LAMA", amount: 100 })]);
  });
  it("tetap menolak jika izin subkategori dicabut", async () => {
    const permissions = buildDefaultRolePermissions(); permissions.SALES.resources["financial-report.daily-subcategory"].read = false;
    mocks.permissions.mockResolvedValue(permissions);
    expect((await GET(request())).status).toBe(403);
    expect(mocks.transactions).not.toHaveBeenCalled();
  });
  it("memfilter sen penerimaan dan pelunasan campuran pada tanggal dan metode yang benar", async () => {
    const settlement = new Date("2026-09-03T03:00:00Z");
    const mixed = { ...invoice, total: 0.02, amountPaid: 0.02, transactionCategory: "ATK", items: [
      { subtotal: 1, product: { category: { name: "Lama" }, catalogSubcategory: { group: "ATK", name: "Buku" } } },
      { subtotal: 1, product: { category: { name: "Lama" }, catalogSubcategory: { group: "PERCETAKAN", name: "PRINT" } } },
    ], payments: [{ id: "p1", method: "CASH", amount: 0.01, createdAt: at }],
      debtPaymentLogs: [{ id: "p2", paymentMethod: "TRANSFER", amount: 0.01, createdAt: settlement }] };
    mocks.transactions.mockImplementation(async input => input.select?.payments ? [mixed] : [{ id: "old", invoiceNumber: "INV-LAMA" }]);
    const params = new URLSearchParams({ mode: "receipt", dateFrom: "2026-09-03", dateTo: "2026-09-03", category: "Percetakan", subcategory: "PRINT", method: "TRANSFER" });
    const response = await GET(new Request(`http://localhost/api/history/receipts?${params}`));
    expect(response.status).toBe(200);
    expect((await response.json()).items).toEqual([expect.objectContaining({ transactionId: "old", amount: 0.01, date: "2026-09-03", methods: ["TRANSFER"] })]);
    params.set("category", "ATK"); params.set("subcategory", "Buku");
    expect((await (await GET(new Request(`http://localhost/api/history/receipts?${params}`))).json()).items).toEqual([]);
  });
});
