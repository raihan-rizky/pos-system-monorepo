import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ permission: vi.fn(), authError: vi.fn(), query: vi.fn(), transaction: vi.fn() }));
vi.mock("@pos/db", () => ({ db: { $queryRaw: mocks.query, $transaction: mocks.transaction } }));
vi.mock("@/lib/rbac/guard", () => ({ requirePermission: mocks.permission, canAuthenticatedUserAccessPage: async () => true, handleAuthError: mocks.authError }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ error: vi.fn() }) }));

import { GET } from "../route";

describe("saldo giro dengan pembayaran bertanggal mendatang", () => {
  const futurePayment = { id: "TRANSFER_EXPENSE:expense-1", amount: "60000", paidAt: "2026-12-05" };
  const purchase = {
    goodsPurchaseId: "purchase-1", number: "PB-CONTOH-004", supplierName: "Pemasok",
    amount: "100000", payableAmount: "100000", debtDate: "2026-11-05", dueDate: "2026-12-05",
    payableId: "payable-1", historyVerifiedAt: new Date("2026-11-06T00:00:00Z"), correctionId: "correction-1",
    credited: "0", effectivePaid: "60000", effectivePayments: [futurePayment], payments: [futurePayment], schedule: [],
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    mocks.permission.mockResolvedValue({ id: "user-1", storeId: "store-1" });
    mocks.authError.mockReturnValue(null);
    mocks.transaction.mockImplementation(queries => Promise.all(queries));
    mocks.query.mockImplementation(async (query: TemplateStringsArray) => query.join(" ").includes('FROM "pos_goods_purchases" g') ? [purchase] : []);
  });
  afterEach(() => vi.useRealTimers());

  const summaryRequest = () => new Request("http://localhost/api/finance/giro?summary=1");
  const manual = {
    id: "manual-1", supplierName: "Pemasok Manual", amount: "25000.25",
    debtDate: "2026-11-10", dueDate: "2026-12-05", payments: [],
  };

  it("merangkum sisa giro dan hutang manual per hari WIB tanpa mengirim rincian pemasok", async () => {
    mocks.query.mockResolvedValueOnce([
      purchase,
      { ...purchase, debtDate: "2026-12-06", historyVerifiedAt: null },
    ]).mockResolvedValueOnce([manual]);
    vi.setSystemTime(new Date("2026-12-04T16:59:59.000Z"));
    const response = await GET(summaryRequest());
    expect(response.status).toBe(200);
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Array), { isolationLevel: "RepeatableRead" });
    expect(await response.json()).toEqual({
      asOf: "2026-12-04", total: 125000.25, giroKnown: 100000, manual: 25000.25, unknownGiroCount: 0,
    });

    mocks.query.mockResolvedValueOnce([purchase]).mockResolvedValueOnce([manual]);
    vi.setSystemTime(new Date("2026-12-04T17:00:00.000Z"));
    expect(await (await GET(summaryRequest())).json()).toEqual({
      asOf: "2026-12-05", total: 40000, giroKnown: 40000, manual: 0, unknownGiroCount: 0,
    });
  });

  it("tidak menganggap saldo giro yang belum diketahui sebagai nol", async () => {
    vi.setSystemTime(new Date("2026-12-04T16:59:59.000Z"));
    mocks.query.mockResolvedValueOnce([purchase, { ...purchase, debtDate: null }]).mockResolvedValueOnce([manual]);
    expect(await (await GET(summaryRequest())).json()).toEqual({
      asOf: "2026-12-04", total: null, giroKnown: 100000, manual: 25000.25, unknownGiroCount: 1,
    });
  });

  it("membatasi ringkasan pada pengguna dengan izin giro dan hutang manual", async () => {
    const forbidden = new Error("Forbidden");
    mocks.permission.mockImplementation(async (resource: string) => {
      if (resource === "expense.payable") throw forbidden;
      return { id: "user-1", storeId: "store-1" };
    });
    mocks.authError.mockImplementation(error => error === forbidden ? new Response(null, { status: 403 }) : null);
    expect((await GET(summaryRequest())).status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
    expect((await GET(new Request("http://localhost/api/finance/giro"))).status).toBe(200);
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it("menghitung pembayaran saat tanggalnya tiba di WIB dan tetap membatasi pembayaran baru sebelumnya", async () => {
    vi.setSystemTime(new Date("2026-12-04T16:59:59.000Z"));
    const before = (await (await GET(new Request("http://localhost/api/finance/giro"))).json()).items[0];
    expect(before).toMatchObject({
      status: "UNPAID", totalPaid: 0, remaining: 100000, availableToPay: 40000,
      futurePayments: [expect.objectContaining({ id: futurePayment.id, amount: 60000, paidAt: "2026-12-05" })],
    });

    vi.setSystemTime(new Date("2026-12-04T17:00:00.000Z"));
    const onDate = (await (await GET(new Request("http://localhost/api/finance/giro"))).json()).items[0];
    expect(onDate).toMatchObject({ status: "PARTIAL", totalPaid: 60000, remaining: 40000, availableToPay: 40000, futurePayments: [] });
  });
});
