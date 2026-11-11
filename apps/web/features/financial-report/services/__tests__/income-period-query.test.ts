import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ transactions: vi.fn(), manual: vi.fn() }));
vi.mock("@pos/db", () => ({ db: { transaction: { findMany: mocks.transactions }, manualIncome: { findMany: mocks.manual } } }));
import * as service from "../daily-income";

type Result = { days: Array<{ date: string; total: number }> };
const loadPeriod = (service as typeof service & { loadIncomePeriod?: (storeId: string, fromDate: string, toDate: string) => Promise<Result> }).loadIncomePeriod;

describe("pemuatan penerimaan untuk satu rentang", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-11T03:00:00Z"));
    mocks.transactions.mockResolvedValue([{
      id: "invoice", createdAt: new Date("2026-11-09T03:00:00Z"), status: "COMPLETED", total: 100_000,
      amountPaid: 100_000, change: 0, paymentMethod: "CASH", transactionCategory: "ATK", printingSubcategory: null,
      items: [], payments: [{ id: "p", method: "CASH", amount: 40_000, createdAt: new Date("2026-11-10T03:00:00Z") }],
      debtPaymentLogs: [{ id: "d", paymentMethod: "TRANSFER", amount: 60_000, createdAt: new Date("2026-11-11T03:00:00Z") }],
    }]);
    mocks.manual.mockResolvedValue([{ id: "manual", occurredAt: new Date("2026-11-11T04:00:00Z"), category: "ATK", amount: 20_000, payments: [] }]);
  });
  afterEach(() => vi.useRealTimers());

  it("mengambil ledger sekali untuk seluruh rentang dan membatasi data pada toko", async () => {
    expect(loadPeriod).toBeTypeOf("function");
    if (!loadPeriod) return;
    const result = await loadPeriod("store-1", "2026-11-10", "2026-11-11");
    expect(result.days.map(day => [day.date, day.total])).toEqual([["2026-11-10", 40_000], ["2026-11-11", 80_000]]);
    expect(mocks.transactions).toHaveBeenCalledTimes(1);
    expect(mocks.manual).toHaveBeenCalledTimes(1);
    expect(mocks.transactions.mock.calls[0][0].where.storeId).toBe("store-1");
    expect(mocks.manual.mock.calls[0][0].where).toMatchObject({ storeId: "store-1", deletedAt: null });
    expect(mocks.manual.mock.calls[0][0].select.payments).toEqual({ select: { method: true, amount: true } });
    expect(mocks.manual.mock.calls[0][0].where.occurredAt).toEqual({ gte: new Date("2026-11-09T17:00:00Z"), lt: new Date("2026-11-11T17:00:00Z") });
  });

  it("tidak membaca atau menampilkan penerimaan untuk rentang yang seluruhnya di masa depan", async () => {
    expect(loadPeriod).toBeTypeOf("function");
    if (!loadPeriod) return;
    expect((await loadPeriod("store-1", "2026-11-12", "2026-11-13")).days).toEqual([]);
    expect(mocks.transactions).not.toHaveBeenCalled();
    expect(mocks.manual).not.toHaveBeenCalled();
  });
  it("memuat checkout offline lama pada tanggal transaksi, meskipun pembayaran dibuat saat sinkronisasi", async () => {
    expect(loadPeriod).toBeTypeOf("function"); if (!loadPeriod) return;
    mocks.manual.mockResolvedValue([]);
    mocks.transactions.mockResolvedValue([{
      id: "offline", createdAt: new Date("2026-11-10T03:00:00Z"), offlineSyncMetadata: { reason: "REPLAYED" }, status: "COMPLETED",
      total: 40_000, amountPaid: 40_000, change: 0, paymentMethod: "CASH", transactionCategory: "ATK", items: [],
      payments: [{ id: "payment", method: "CASH", amount: 40_000, createdAt: new Date("2026-11-11T03:00:00Z") }], debtPaymentLogs: [],
    }]);
    const result = await loadPeriod("store-1", "2026-11-10", "2026-11-10");
    expect(result.days[0].total).toBe(40_000);
    const query = mocks.transactions.mock.calls[0][0];
    expect(query.where.OR).toEqual(expect.arrayContaining([expect.objectContaining({ offlineClientMutationId: { not: null }, createdAt: { gte: new Date("2026-11-09T17:00:00Z"), lt: new Date("2026-11-10T17:00:00Z") } })]));
    expect(query.select.offlineSyncMetadata).toBe(true);
  });
});
