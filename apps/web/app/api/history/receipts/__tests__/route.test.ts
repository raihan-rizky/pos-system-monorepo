import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDefaultRolePermissions } from "@/features/rbac/helpers/rbac-core";

const mocks = vi.hoisted(() => ({ user: vi.fn(), permissions: vi.fn(), transactions: vi.fn(), manual: vi.fn() }));
vi.mock(import("@/lib/rbac/guard"), async importOriginal => ({
  ...await importOriginal(),
  getCurrentUser: mocks.user,
}));
vi.mock("@/features/rbac/helpers/rbac-server", () => ({ getGlobalRolePermissions: mocks.permissions }));
vi.mock("@pos/db", () => ({ db: { transaction: { findMany: mocks.transactions }, manualIncome: { findMany: mocks.manual } } }));
type Route = { GET: (request: Request) => Promise<Response> };
const loadRoute = () => vi.importActual<Route>("../route").catch(() => null);
const request = (query = "mode=receipt&dateFrom=2026-11-11&dateTo=2026-11-11") => new Request(`http://localhost/api/history/receipts?${query}`);
const oldInvoice = {
  id: "old-invoice", createdAt: new Date("2026-11-09T03:00:00Z"), status: "COMPLETED", total: 100_000,
  amountPaid: 100_000, change: 0, paymentMethod: "CASH", transactionCategory: "ATK", printingSubcategory: null,
  items: [{ subtotal: 100_000, product: { category: { name: "Kertas" } } }],
  payments: [{ id: "p", method: "CASH", amount: 40_000, createdAt: new Date("2026-11-10T03:00:00Z") }],
  debtPaymentLogs: [{ id: "d", paymentMethod: "TRANSFER", amount: 60_000, createdAt: new Date("2026-11-11T03:00:00Z") }],
};
const dp = { ...oldInvoice, id: "dp", status: "DP", total: 100_000, amountPaid: 25_000, payments: [], debtPaymentLogs: [] };

describe("Riwayat penerimaan dan Outstanding DP", () => {
  beforeEach(() => {
    vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-11T03:00:00Z"));
    mocks.user.mockResolvedValue({ id: "sales", role: "SALES", storeId: "store-1" });
    mocks.permissions.mockResolvedValue(buildDefaultRolePermissions());
    mocks.transactions.mockImplementation(async query => query.select?.payments ? [oldInvoice, dp] : [{ id: "old-invoice", invoiceNumber: "INV-OLD" }, { id: "dp", invoiceNumber: "INV-DP" }]);
    mocks.manual.mockImplementation(async query => query.select?.category
      ? [{ id: "manual", occurredAt: new Date("2026-11-11T04:00:00Z"), category: "ATK", amount: 20_000 }]
      : [{ id: "manual", description: "Pemasukan contoh", occurredAt: new Date("2026-11-11T04:00:00Z") }]);
  });
  afterEach(() => vi.useRealTimers());

  it("mengembalikan 503 tanpa membaca penerimaan saat sesi belum dapat diverifikasi", async () => {
    const route = await loadRoute(); expect(route).not.toBeNull(); if (!route) return;
    const { AuthError } = await import("@/lib/rbac/guard");
    mocks.user.mockRejectedValueOnce(new AuthError(503, "Sesi belum dapat diverifikasi"));

    const response = await route.GET(request());

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "ServiceUnavailable" });
    expect(mocks.permissions).not.toHaveBeenCalled();
    expect(mocks.transactions).not.toHaveBeenCalled();
    expect(mocks.manual).not.toHaveBeenCalled();
  });

  it("menampilkan pelunasan nota lama pada tanggal penerimaan tanpa detail manual yang tidak diizinkan", async () => {
    const route = await loadRoute(); expect(route).not.toBeNull(); if (!route) return;
    const response = await route.GET(request());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items).toEqual(expect.arrayContaining([expect.objectContaining({ transactionId: "old-invoice", amount: 60_000, invoiceNumber: "INV-OLD" })]));
    expect(body.manualEntries).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("Pemasukan contoh");
  });

  it("menampilkan rincian manual untuk pemilik dan memfilter metode yang dipilih", async () => {
    const route = await loadRoute(); expect(route).not.toBeNull(); if (!route) return;
    mocks.user.mockResolvedValue({ id: "owner", role: "OWNER", storeId: "store-1" });
    const body = await (await route.GET(request("mode=receipt&dateFrom=2026-11-11&dateTo=2026-11-11&method=TRANSFER"))).json();
    expect(body.items).toEqual(expect.arrayContaining([expect.objectContaining({ transactionId: "old-invoice", amount: 60_000 })]));
    expect(body.manualEntries).toEqual([]);
  });

  it("menggabungkan pemasukan multi-payment dan memfilter nominal per metode", async () => {
    const route = await loadRoute(); expect(route).not.toBeNull(); if (!route) return;
    mocks.user.mockResolvedValue({ id: "owner", role: "OWNER", storeId: "store-1" });
    const income = { id: "manual", occurredAt: new Date("2026-11-11T04:00:00Z"), category: "ATK", amount: 20_000 };
    mocks.manual.mockImplementation(async query => query.select?.category
      ? [{ ...income, ...(query.select.payments ? { payments: [{ method: "CASH", amount: 8_000 }, { method: "TRANSFER", amount: 12_000 }] } : {}) }]
      : [{ id: "manual", description: "Pemasukan contoh" }]);

    const all = await (await route.GET(request())).json();
    expect(all.manualEntries).toEqual([expect.objectContaining({ id: "manual", amount: 20_000, methods: ["CASH", "TRANSFER"] })]);
    const filtered = await (await route.GET(request("mode=receipt&dateFrom=2026-11-11&dateTo=2026-11-11&method=TRANSFER"))).json();
    expect(filtered.manualEntries).toEqual([expect.objectContaining({ id: "manual", amount: 12_000, methods: ["TRANSFER"] })]);
  });

  it("merinci metode dan kategori untuk penerimaan pada tanggal pilihan", async () => {
    const route = await loadRoute(); expect(route).not.toBeNull(); if (!route) return;
    mocks.user.mockResolvedValue({ id: "owner", role: "OWNER", storeId: "store-1" });
    const income = { id: "manual", occurredAt: new Date("2026-11-11T04:00:00Z"), category: "ATK", amount: 20_000 };
    mocks.manual.mockImplementation(async query => query.select?.category
      ? [{ ...income, payments: [{ method: "CASH", amount: 8_000 }, { method: "TRANSFER", amount: 12_000 }] }]
      : [{ id: "manual", description: "Pemasukan contoh" }]);

    const body = await (await route.GET(request())).json();
    expect(body.summary).toEqual({
      total: 80_000,
      paymentMethods: [{ method: "CASH", amount: 8_000 }, { method: "TRANSFER", amount: 72_000 }],
    });
    expect(body.items.find((row: { transactionId: string }) => row.transactionId === "old-invoice")).toMatchObject({
      amount: 60_000,
      paymentBreakdown: [{ method: "TRANSFER", amount: 60_000 }],
      categoryBreakdown: [{ category: "ATK", amount: 60_000 }],
    });
    expect(body.manualEntries).toEqual([expect.objectContaining({
      id: "manual", amount: 20_000,
      paymentBreakdown: [{ method: "CASH", amount: 8_000 }, { method: "TRANSFER", amount: 12_000 }],
      categoryBreakdown: [{ category: "ATK", amount: 20_000 }],
    })]);

    const filtered = await (await route.GET(request("mode=receipt&dateFrom=2026-11-11&dateTo=2026-11-11&method=TRANSFER"))).json();
    expect(filtered).not.toHaveProperty("summary");
    expect(filtered.manualEntries[0]).toMatchObject({
      amount: 12_000,
      paymentBreakdown: [{ method: "TRANSFER", amount: 12_000 }],
      categoryBreakdown: [{ category: "ATK", amount: 12_000 }],
    });
    const category = await (await route.GET(request("mode=receipt&dateFrom=2026-11-11&dateTo=2026-11-11&category=ATK"))).json();
    expect(category).not.toHaveProperty("summary");
  });

  it("hanya mengirim rincian yang diizinkan dalam pratinjau Sales", async () => {
    const route = await loadRoute(); expect(route).not.toBeNull(); if (!route) return;
    mocks.user.mockResolvedValue({ id: "owner", role: "OWNER", storeId: "store-1" });
    const permissions = buildDefaultRolePermissions();
    permissions.SALES.resources["financial-report.daily-payment-method"].read = false;
    permissions.SALES.resources["financial-report.daily-category"].read = true;
    permissions.SALES.resources.income.read = true;
    mocks.permissions.mockResolvedValue(permissions);
    const body = await (await route.GET(request("mode=receipt&dateFrom=2026-11-11&dateTo=2026-11-11&view=sales"))).json();
    const receipt = body.items.find((row: { transactionId: string }) => row.transactionId === "old-invoice");
    expect(body.summary).toEqual({ total: 80_000 });
    expect(receipt.categoryBreakdown).toEqual([{ category: "ATK", amount: 60_000 }]);
    expect(receipt).not.toHaveProperty("paymentBreakdown");
    expect(body.manualEntries[0]).not.toHaveProperty("paymentBreakdown");

    permissions.SALES.resources["financial-report.daily-category"].read = false;
    permissions.SALES.resources["financial-report.daily-payment-method"].read = true;
    permissions.SALES.resources.income.read = false;
    const restricted = await (await route.GET(request("mode=receipt&dateFrom=2026-11-11&dateTo=2026-11-11&view=sales"))).json();
    expect(restricted.items[0].paymentBreakdown).toEqual([{ method: "TRANSFER", amount: 60_000 }]);
    expect(restricted.items[0]).not.toHaveProperty("categoryBreakdown");
    expect(restricted.manualEntries).toBeUndefined();
    expect(restricted.summary).toEqual({ total: 80_000, paymentMethods: [{ method: "Belum dicatat", amount: 20_000 }, { method: "TRANSFER", amount: 60_000 }] });
    expect(JSON.stringify(restricted.summary)).not.toContain("Pemasukan contoh");
  });

  it("menjaga presisi pecahan pada rincian metode dan kategori", async () => {
    const route = await loadRoute(); expect(route).not.toBeNull(); if (!route) return;
    mocks.user.mockResolvedValue({ id: "owner", role: "OWNER", storeId: "store-1" });
    const fractional = { ...oldInvoice, id: "fractional", total: 0.99, amountPaid: 0.99, debtPaymentLogs: [],
      payments: [{ id: "cash", method: "CASH", amount: 0.5, createdAt: new Date("2026-11-11T03:00:00Z") },
        { id: "transfer", method: "TRANSFER", amount: 0.49, createdAt: new Date("2026-11-11T04:00:00Z") }] };
    mocks.transactions.mockImplementation(async query => query.select?.payments ? [fractional] : [{ id: "fractional", invoiceNumber: "INV-FRAC" }]);
    mocks.manual.mockResolvedValue([]);
    const body = await (await route.GET(request())).json();
    expect(body.items).toEqual([expect.objectContaining({
      amount: 0.99,
      paymentBreakdown: [{ method: "CASH", amount: 0.5 }, { method: "TRANSFER", amount: 0.49 }],
      categoryBreakdown: [{ category: "ATK", amount: 0.99 }],
    })]);
  });

  it("memfilter subkategori sesuai alokasi penerimaan", async () => {
    const route = await loadRoute(); expect(route).not.toBeNull(); if (!route) return;
    const body = await (await route.GET(request("mode=receipt&dateFrom=2026-11-11&dateTo=2026-11-11&category=ATK&subcategory=Kertas"))).json();
    expect(body.items).toEqual(expect.arrayContaining([expect.objectContaining({ transactionId: "old-invoice", amount: 60_000 })]));
  });
  it("menerima nama subkategori produk hingga 150 karakter", async () => {
    const route = await loadRoute(); expect(route).not.toBeNull(); if (!route) return;
    const params = new URLSearchParams({ mode: "receipt", dateFrom: "2026-11-11", dateTo: "2026-11-11", category: "ATK", subcategory: "A".repeat(150) });
    expect((await route.GET(request(params.toString()))).status).toBe(200);
  });

  it("memakai sisa DP terkini dari nota sebelumnya dan mengecualikan Tempo", async () => {
    const route = await loadRoute(); expect(route).not.toBeNull(); if (!route) return;
    const body = await (await route.GET(request("mode=outstanding-dp&dateFrom=2026-11-11&dateTo=2026-11-11"))).json();
    expect(body.items).toEqual([expect.objectContaining({ transactionId: "dp", amount: 75_000 })]);
    expect(body).not.toHaveProperty("summary");
  });

  it("tidak menambahkan ringkasan harian pada rentang beberapa hari", async () => {
    const route = await loadRoute(); expect(route).not.toBeNull(); if (!route) return;
    const body = await (await route.GET(request("mode=receipt&dateFrom=2026-11-10&dateTo=2026-11-11"))).json();
    expect(body).not.toHaveProperty("summary");
  });

  it("menolak rincian kategori jika izinnya dicabut", async () => {
    const route = await loadRoute(); expect(route).not.toBeNull(); if (!route) return;
    const permissions = buildDefaultRolePermissions(); permissions.SALES.resources["financial-report.daily-category"].read = false;
    mocks.permissions.mockResolvedValue(permissions);
    expect((await route.GET(request("mode=receipt&dateFrom=2026-11-11&dateTo=2026-11-11&category=ATK"))).status).toBe(403);
  });

  it("menyembunyikan metode transaksi dan pemasukan manual bila izin metode dicabut", async () => {
    const route = await loadRoute(); expect(route).not.toBeNull(); if (!route) return;
    const permissions = buildDefaultRolePermissions();
    permissions.SALES.resources["financial-report.daily-payment-method"].read = false;
    permissions.SALES.resources.income.read = true;
    mocks.permissions.mockResolvedValue(permissions);
    const body = await (await route.GET(request())).json();
    expect(body.items).toEqual(expect.arrayContaining([expect.objectContaining({ transactionId: "old-invoice", methods: [] })]));
    expect(body.manualEntries).toEqual(expect.arrayContaining([expect.objectContaining({ id: "manual", methods: [] })]));
    expect((await route.GET(request("mode=receipt&dateFrom=2026-11-11&dateTo=2026-11-11&method=TRANSFER"))).status).toBe(403);
  });

  it("menolak pengguna tanpa halaman Riwayat, tanpa transaksi, atau tanpa toko", async () => {
    const route = await loadRoute(); expect(route).not.toBeNull(); if (!route) return;
    const permissions = buildDefaultRolePermissions(); permissions.SALES.pages["/history"] = false;
    mocks.permissions.mockResolvedValueOnce(permissions);
    expect((await route.GET(request())).status).toBe(403);
    const noTransaction = buildDefaultRolePermissions(); noTransaction.SALES.resources.transaction.read = false;
    mocks.permissions.mockResolvedValueOnce(noTransaction);
    expect((await route.GET(request())).status).toBe(403);
    mocks.user.mockResolvedValueOnce({ id: "sales", role: "SALES", storeId: null });
    expect((await route.GET(request())).status).toBe(403);
  });

  it("menolak tanggal tidak sah dan menutup akses saat snapshot izin gagal", async () => {
    const route = await loadRoute(); expect(route).not.toBeNull(); if (!route) return;
    expect((await route.GET(request("mode=receipt&dateFrom=2026-02-30&dateTo=2026-11-11"))).status).toBe(422);
    mocks.permissions.mockRejectedValueOnce(new Error("unavailable"));
    expect((await route.GET(request())).status).toBe(503);
  });

  it("menerapkan izin Sales ketika Owner menggunakan pratinjau", async () => {
    const route = await loadRoute(); expect(route).not.toBeNull(); if (!route) return;
    mocks.user.mockResolvedValue({ id: "owner", role: "OWNER", storeId: "store-1" });
    const body = await (await route.GET(request("mode=receipt&dateFrom=2026-11-11&dateTo=2026-11-11&view=sales"))).json();
    expect(body.manualEntries).toBeUndefined();
  });
});
