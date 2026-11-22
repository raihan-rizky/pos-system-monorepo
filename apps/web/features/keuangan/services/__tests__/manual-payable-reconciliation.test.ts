import { beforeEach, describe, expect, it, vi } from "vitest";
import { reconcilePayable } from "../manual-payable-reconciliation";

const mocks = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() }));
const tx = { $queryRaw: mocks.query, $executeRaw: mocks.execute, supplierPayablePayment: { findMany: mocks.findMany, create: mocks.create, update: mocks.update, delete: mocks.delete } } as never;
const scope = { storeId: "store-1", payableId: "debt-1", actorId: "user-1", todayWib: "2026-11-16" };
const debt = { id: "debt-1", amount: "1000.00", debtDate: "2026-11-01", dueDate: "2026-11-10" };
const payment = { id: "manual-1", amount: "400.00", paidAt: new Date("2026-11-05T00:00:00Z"), origin: "MANUAL", transferAllocation: null };

describe("rekonsiliasi pelunasan otomatis hutang manual", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.query.mockResolvedValue([debt]);
    mocks.findMany.mockResolvedValue([payment]);
  });

  it("menyimpan satu pelunasan otomatis sebesar sisa pada tanggal jatuh tempo", async () => {
    await reconcilePayable(tx, scope);
    expect(mocks.query.mock.calls[0][0].join(" ")).toContain("FOR UPDATE");
    expect(mocks.query.mock.calls[0][0].join(" ")).toContain('"goodsPurchaseId" IS NULL');
    expect(mocks.query.mock.calls[0]).toContain("store-1");
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      payableId: "debt-1", amount: 600, paidAt: new Date("2026-11-10T00:00:00Z"), origin: "AUTO", automaticKey: "due:debt-1", createdById: "user-1",
    }) }));
  });

  it("tidak membuat pelunasan kedua untuk pembayaran manual yang tercatat terlambat", async () => {
    mocks.findMany.mockResolvedValue([{ ...payment, amount: "1000.00", paidAt: new Date("2026-11-12T00:00:00Z") }]);
    await reconcilePayable(tx, scope);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("mengoreksi sisa otomatis yang tersimpan tanpa membuat pembayaran baru", async () => {
    mocks.findMany.mockResolvedValue([payment, { id: "auto-1", amount: "1000.00", paidAt: new Date("2026-11-10T00:00:00Z"), origin: "AUTO", transferAllocation: null }]);
    await reconcilePayable(tx, scope);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "auto-1" }, data: expect.objectContaining({ amount: 600 }) }));
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("menolak perubahan yang membuat alokasi pembayaran otomatis tidak sah", async () => {
    mocks.findMany.mockResolvedValue([payment, { id: "auto-1", amount: "1000.00", paidAt: new Date("2026-11-10T00:00:00Z"), origin: "AUTO", transferAllocation: { amount: "700.00" } }]);
    await expect(reconcilePayable(tx, scope)).rejects.toThrow(/alokasi transfer/i);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it("menolak hutang giro atau hutang toko lain", async () => {
    mocks.query.mockResolvedValue([]);
    await expect(reconcilePayable(tx, scope)).rejects.toThrow(/tidak ditemukan/i);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("mengunci identitas hutang yang telah ditautkan ke giro agar tidak ditafsirkan sebagai hutang baru", async () => {
    await reconcilePayable(tx, scope);
    expect(mocks.query.mock.calls[0][0].join(" ")).toContain('"goodsPurchaseId" IS NULL');
  });
});
