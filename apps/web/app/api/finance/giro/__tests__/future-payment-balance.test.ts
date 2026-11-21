import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ permission: vi.fn(), authError: vi.fn(), query: vi.fn() }));
vi.mock("@pos/db", () => ({ db: { $queryRaw: mocks.query } }));
vi.mock("@/lib/rbac/guard", () => ({ requirePermission: mocks.permission, handleAuthError: mocks.authError }));
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
    mocks.query.mockImplementation(async () => [purchase]);
  });
  afterEach(() => vi.useRealTimers());

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
