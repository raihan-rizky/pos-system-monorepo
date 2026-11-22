import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const transactionFindManyMock = vi.hoisted(() => vi.fn());
const expenseFindManyMock = vi.hoisted(() => vi.fn());
const manualIncomeFindManyMock = vi.hoisted(() => vi.fn());
const payableFindManyMock = vi.hoisted(() => vi.fn());
const receivableFindManyMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));
vi.mock("@/features/financial-report/services/export-access", () => ({ getFinancialExportAccess: async () => ({ user: await requirePermissionMock("financial-report.export", "read"), canReadManualIncome: true, canReadTransactions: true, canReadExpenses: true, canReadCustomers: true, canReadReceivables: true, canReadPurchases: true }) }));

vi.mock("@pos/db", () => ({
  db: {
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback({
      expense: { findMany: expenseFindManyMock }, supplierPayable: { findMany: payableFindManyMock },
    }),
    transaction: { findMany: transactionFindManyMock },
    expense: { findMany: expenseFindManyMock },
    manualIncome: { findMany: manualIncomeFindManyMock },
    supplierPayable: { findMany: payableFindManyMock },
    customerReceivable: { findMany: receivableFindManyMock },
  },
}));

describe("GET /api/finance/report/journal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockResolvedValue({ id: "user-1", storeId: "store-1" });
    handleAuthErrorMock.mockReturnValue(null);
    transactionFindManyMock.mockResolvedValue([]);
    expenseFindManyMock.mockResolvedValue([]);
    manualIncomeFindManyMock.mockResolvedValue([]);
    payableFindManyMock.mockResolvedValue([]);
    receivableFindManyMock.mockResolvedValue([]);
  });

  it("scopes both sales and expense rows to the current store", async () => {
    const response = await GET(
      new Request("http://localhost/api/finance/report/journal?period=monthly"),
    );

    expect(response.status).toBe(200);
    expect(transactionFindManyMock.mock.calls[0][0].select.items.select.product.select.catalogSubcategory).toEqual({ select: { group: true, name: true } });
    expect(transactionFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: "store-1",
        }),
      }),
    );
    expect(expenseFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: "store-1",
          deletedAt: null,
        }),
      }),
    );
  });

  it("labels shopping-request expenses and missing cost snapshots in exports", async () => {
    expenseFindManyMock.mockResolvedValueOnce([
      {
        id: "expense-1",
        occurredAt: new Date("2026-07-01T02:00:00.000Z"),
        applicantName: "CV Kertas",
        category: "SUPPLIES",
        description: "Permohonan Belanja DPB-202607-001 - 2 item",
        amount: { toString: () => "0.00" },
        changeAmount: { toString: () => "0.00" },
        hasMissingCostSnapshot: true,
        shoppingRequest: { id: "request-1", number: "DPB-202607-001" },
        goodsPurchase: { id: "purchase-1", number: "PB-202607-001" },
      },
    ]);

    const response = await GET(
      new Request("http://localhost/api/finance/report/journal?period=monthly"),
    );
    const body = await response.json();

    expect(body.rows[0].products).toContain("Pembelian Barang PB-202607-001");
    expect(body.rows[0].products).toContain("Harga modal tidak tersedia saat approval");
  });

  it("queries sales journal rows by invoiceDate", async () => {
    const response = await GET(
      new Request("http://localhost/api/finance/report/journal?period=monthly"),
    );

    expect(response.status).toBe(200);
    expect(transactionFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          invoiceDate: { gte: expect.any(Date), lt: expect.any(Date) },
        }),
        orderBy: { invoiceDate: "asc" },
        select: expect.objectContaining({ invoiceDate: true }),
      }),
    );
  });

  it("uses the selected inclusive WIB date range", async () => {
    const response = await GET(new Request("http://localhost/api/finance/report/journal?period=custom&from=2026-05-03&to=2026-05-05"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ period: "custom", from: "2026-05-03", to: "2026-05-05" });
    expect(transactionFindManyMock.mock.calls[0][0].where.invoiceDate).toEqual({
      gte: new Date("2026-05-02T17:00:00Z"), lt: new Date("2026-05-05T17:00:00Z"),
    });
  });

  it("rejects invalid or excessive custom ranges", async () => {
    for (const range of ["from=2026-02-30&to=2026-03-03", "from=2026-05-05&to=2026-05-03", "from=2024-01-01&to=2026-01-01"]) {
      expect((await GET(new Request(`http://localhost/api/finance/report/journal?period=custom&${range}`))).status).toBe(422);
    }
  });

  it("includes split manual income once in rows, payment totals and category totals", async () => {
    manualIncomeFindManyMock.mockResolvedValueOnce([{
      id: "income-1", occurredAt: new Date("2026-05-04T03:00:00Z"), description: "Pendapatan tambahan",
      category: "ATK", amount: 100, payments: [{ method: "CASH", amount: 40 }, { method: "TRANSFER", amount: 60 }],
    }]);
    const response = await GET(new Request("http://localhost/api/finance/report/journal?period=monthly"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.rows.map((row: { amount: number }) => row.amount)).toEqual([40, 60]);
    expect(body.rows.every((row: { categories: string }) => row.categories === "ATK / Pemasukan manual")).toBe(true);
    expect(body.footer).toMatchObject({ totalPemasukan: 100, byMethod: { CASH: 40, TRANSFER: 60 } });
    expect(body.categories).toEqual([{ categoryName: "ATK / Pemasukan manual", transactionCount: 1, revenue: 100 }]);
    expect(manualIncomeFindManyMock.mock.calls[0][0].where).toMatchObject({ storeId: "store-1", deletedAt: null, occurredAt: { gte: expect.any(Date), lt: expect.any(Date) } });
  });
  it("keeps printing manual income with incomplete payments in its classified total", async () => {
    manualIncomeFindManyMock.mockResolvedValueOnce([{
      id: "income-print", occurredAt: new Date("2026-05-04T03:00:00Z"), description: "Cetak manual",
      category: "SPANDUK", amount: 75.5, payments: [],
    }]);
    const response = await GET(new Request("http://localhost/api/finance/report/journal?period=monthly"));
    const body = await response.json();
    expect(body.rows).toEqual([expect.objectContaining({ categories: "Percetakan / Spanduk", amount: 75.5, method: "Belum dicatat" })]);
    expect(body.footer.totalPemasukan).toBe(75.5);
    expect(body.categories).toEqual([{ categoryName: "Percetakan / Spanduk", transactionCount: 1, revenue: 75.5 }]);
  });
  it("membagi transfer menurut kategori hutang dan menambahkan pelunasan otomatis sekali", async () => {
    const date = new Date("2026-11-05T03:00:00Z");
    const raw = { id: "transfer", storeId: "store-1", occurredAt: date, applicantName: "Pemohon", category: "SUPPLIES", customCategory: null,
      description: "Transfer", amount: 350, changeAmount: 0, hasMissingCostSnapshot: false, manualPurchasePaymentMethod: "TRANSFER",
      shoppingRequestId: null, goodsPurchaseId: null, backdatedPurchaseDueId: null, backdatedPurchasePaymentId: null, shoppingRequest: null, goodsPurchase: null, reportCategory: "CETAK_PLAT" };
    const transfer = { ...raw, manualTransferAllocations: [{ paymentId: "p-a", payableId: "a", amount: 100 }, { paymentId: "p-b", payableId: "b", amount: 200 }] };
    expenseFindManyMock.mockImplementation(async query => query.select.manualTransferAllocations ? [transfer] : [raw]);
    const debt = (id: string, amount: number, reportCategory: string, payments: unknown[], dueDate: Date | null = null) => ({ id, storeId: "store-1", supplierName: id, amount, debtDate: new Date("2026-11-01T00:00:00Z"), dueDate, reportCategory, note: null, payments });
    const payment = (id: string, amount: number) => ({ id, amount, paidAt: new Date("2026-11-05T00:00:00Z"), origin: "MANUAL" });
    payableFindManyMock.mockResolvedValue([debt("a", 100, "ATK", [payment("p-a", 100)]), debt("b", 200, "SPANDUK", [payment("p-b", 200)]), debt("c", 600, "ATK", [], new Date("2026-11-05T00:00:00Z"))]);
    const response = await GET(new Request("http://localhost/api/finance/report/journal?period=custom&from=2026-11-05&to=2026-11-05"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.footer.totalPengeluaran).toBe(-950);
    expect(body.rows.map((row: { categories: string; amount: number }) => [row.categories, row.amount])).toEqual(expect.arrayContaining([
      ["ATK", -100], ["Spanduk", -200], ["Cetak / Plat", -50], ["ATK", -600],
    ]));
  });
  it("menampilkan pembayaran piutang manual pada tanggal dan kategori yang dipilih", async () => {
    receivableFindManyMock.mockResolvedValue([{ id: "r1", amount: 100, reportCategory: "ATK", note: "Tagihan", customer: { name: "Pelanggan" },
      payments: [{ id: "p1", amount: 100, method: "TRANSFER", paidAt: new Date("2026-11-05T00:00:00Z"), createdAt: new Date("2026-11-06T04:00:00Z") }] }]);
    const response = await GET(new Request("http://localhost/api/finance/report/journal?period=custom&from=2026-11-05&to=2026-11-05"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.rows).toEqual(expect.arrayContaining([expect.objectContaining({ tanggal: "2026-11-05", categories: "ATK / Piutang manual", amount: 100, method: "TRANSFER" })]));
    expect(body.footer.totalPemasukan).toBe(100);
  });
});
