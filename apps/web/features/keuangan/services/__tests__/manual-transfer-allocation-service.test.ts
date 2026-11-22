import { beforeEach, describe, expect, it, vi } from "vitest";
import { linkTransferAllocations } from "../manual-transfer-allocation-service";

const mocks = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn(), findAllocations: vi.fn(), deleteAllocations: vi.fn(), createAllocation: vi.fn(), findPayments: vi.fn(), findPayment: vi.fn(), createPayment: vi.fn(), reconcile: vi.fn() }));
vi.mock("../manual-payable-reconciliation", async original => ({ ...await original<object>(), reconcilePayable: mocks.reconcile }));
const tx = { $queryRaw: mocks.query, $executeRaw: mocks.execute, manualTransferAllocation: { findMany: mocks.findAllocations, deleteMany: mocks.deleteAllocations, create: mocks.createAllocation },
  supplierPayablePayment: { findMany: mocks.findPayments, findFirst: mocks.findPayment, create: mocks.createPayment } } as never;
const scope = { storeId: "store-1", expenseId: "transfer-1", actorId: "owner-1", todayWib: "2026-11-16" };
const transfer = { id: "transfer-1", amount: "350", date: "2026-11-05", reportCategory: "SALARY" };
const payment = (id: string, amount: string) => ({ id, amount, paidAt: new Date("2026-11-05T00:00:00Z"), origin: "MANUAL", transferAllocation: null });

describe("penautan alokasi transfer", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.query.mockImplementation(async (sql: TemplateStringsArray, ...values: unknown[]) => sql.join(" ").includes('FROM "pos_expenses"')
      ? [transfer] : [{ id: values[0], amount: "500", debtDate: "2026-11-01", reportCategory: values[0] === "debt-a" ? "ATK" : "SPANDUK" }]);
    mocks.findAllocations.mockResolvedValue([]);
    mocks.deleteAllocations.mockResolvedValue({ count: 0 });
    mocks.findPayments.mockImplementation(async ({ where }: { where: { payableId: string } }) => where.payableId === "debt-a" ? [payment("p1", "100")] : [payment("p2", "200")]);
    mocks.reconcile.mockResolvedValue({ automaticPaymentId: null });
    mocks.createAllocation.mockResolvedValue({});
    mocks.createPayment.mockResolvedValue({});
    mocks.findPayment.mockImplementation(async ({ where }: { where: { id: string } }) => {
      if (where.id === "p1") return payment("p1", "100");
      if (where.id === "p2") return payment("p2", "200");
      const created = mocks.createPayment.mock.calls.find(call => call[0].data.id === where.id)?.[0].data;
      return created ? { ...created, transferAllocation: null } : null;
    });
  });

  it("menautkan beberapa pembayaran secara atomik ke satu transfer", async () => {
    const result = await linkTransferAllocations(tx, scope, [
      { payableId: "debt-b", paymentId: "p2", amount: 200 }, { payableId: "debt-a", paymentId: "p1", amount: 100 },
    ]);
    expect(result).toMatchObject({ allocated: 300, remaining: 50 });
    expect(mocks.createAllocation).toHaveBeenCalledTimes(2);
    expect(mocks.createAllocation).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ storeId: "store-1", expenseId: "transfer-1", payableId: "debt-a", paymentId: "p1", amount: 100 }) }));
    const locked = mocks.query.mock.calls.filter(call => call[0].join(" ").includes('FROM "pos_supplier_payables"'));
    expect(locked.map(call => call[1])).toEqual(["debt-a", "debt-b"]);
    expect(locked.every(call => call[0].join(" ").includes("FOR UPDATE") && call.includes("store-1"))).toBe(true);
  });

  it("menolak alokasi melebihi transfer atau pembayaran sebelum menyimpan hubungan", async () => {
    await expect(linkTransferAllocations(tx, scope, [{ payableId: "debt-a", paymentId: "p1", amount: 351 }])).rejects.toThrow();
    await expect(linkTransferAllocations(tx, scope, [{ payableId: "debt-a", paymentId: "p1", amount: 101 }])).rejects.toThrow();
    expect(mocks.createAllocation).not.toHaveBeenCalled();
  });

  it("menolak tanggal berbeda dan pembayaran yang sudah ditautkan ke transfer lain", async () => {
    mocks.findPayments.mockResolvedValueOnce([{ ...payment("p1", "100"), paidAt: new Date("2026-11-06T00:00:00Z") }]);
    await expect(linkTransferAllocations(tx, scope, [{ payableId: "debt-a", paymentId: "p1", amount: 100 }])).rejects.toThrow();
    mocks.findPayments.mockResolvedValueOnce([{ ...payment("p1", "100"), transferAllocation: { expenseId: "other", amount: "100" } }]);
    await expect(linkTransferAllocations(tx, scope, [{ payableId: "debt-a", paymentId: "p1", amount: 100 }])).rejects.toThrow();
    expect(mocks.createAllocation).not.toHaveBeenCalled();
  });

  it("menolak hutang toko lain atau giro", async () => {
    mocks.query.mockResolvedValueOnce([transfer]).mockResolvedValueOnce([]);
    await expect(linkTransferAllocations(tx, scope, [{ payableId: "outside", paymentId: "p1", amount: 100 }])).rejects.toThrow();
    expect(mocks.createAllocation).not.toHaveBeenCalled();
  });

  it("dapat membuat pembayaran baru pada tanggal transfer", async () => {
    mocks.findPayments.mockResolvedValue([]);
    const result = await linkTransferAllocations(tx, scope, [{ payableId: "debt-a", paymentId: null, amount: 100 }]);
    expect(result).toMatchObject({ allocated: 100, remaining: 250 });
    expect(mocks.createPayment).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ payableId: "debt-a", amount: 100, paidAt: new Date("2026-11-05T00:00:00Z"), createdById: "owner-1" }) }));
    expect(mocks.createAllocation).toHaveBeenCalledOnce();
  });

  it("meminta izin koreksi sebelum pembayaran baru mengubah pelunasan otomatis", async () => {
    mocks.query.mockResolvedValueOnce([transfer]).mockResolvedValueOnce([{ id: "debt-a", amount: "500", debtDate: "2026-11-01", dueDate: "2026-11-03", reportCategory: "ATK" }]);
    mocks.findPayments.mockResolvedValue([]);
    const authorizeAutomaticCorrection = vi.fn().mockRejectedValue(new Error("forbidden"));
    await expect(linkTransferAllocations(tx, { ...scope, authorizeAutomaticCorrection }, [{ payableId: "debt-a", paymentId: null, amount: 100 }])).rejects.toThrow("forbidden");
    expect(authorizeAutomaticCorrection).toHaveBeenCalledOnce();
    expect(mocks.createPayment).not.toHaveBeenCalled();
  });

  it("menolak perubahan alokasi ketika izin dicabut saat menunggu lock hutang", async () => {
    mocks.findAllocations.mockResolvedValue([{ payableId: "debt-a" }]);
    const authorizeAfterLocks = vi.fn(async () => {
      expect(mocks.query.mock.calls.filter(call => call[0].join(" ").includes('FROM "pos_supplier_payables"'))).toHaveLength(1);
      throw new Error("forbidden");
    });
    await expect(linkTransferAllocations(tx, { ...scope, authorizeAfterLocks }, [{ payableId: "debt-a", paymentId: "p1", amount: 100 }])).rejects.toThrow("forbidden");
    expect(mocks.deleteAllocations).not.toHaveBeenCalled();
    expect(mocks.createAllocation).not.toHaveBeenCalled();
  });
});
