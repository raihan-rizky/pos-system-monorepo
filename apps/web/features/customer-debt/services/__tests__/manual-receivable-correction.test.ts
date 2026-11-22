import { beforeEach, describe, expect, it, vi } from "vitest";
import { correctReceivable, correctReceivablePayment, receivableCorrectionSchema, receivablePaymentCorrectionSchema } from "../manual-receivable-correction";

const actor = { id: "owner-1", storeId: "store-1" };
const debt = { id: "r1", customerId: "c1", storeId: "store-1", amount: 1000, amountPaid: 400,
  debtDate: new Date("2026-10-01T00:00:00Z"), updatedAt: new Date("2026-10-05T04:00:00Z"), payments: [{ id: "p1", amount: 400, method: "CASH", createdAt: new Date("2026-10-05T03:00:00Z"), paidAt: null, note: null }] };
const expectedUpdatedAt = "2026-10-05T04:00:00.000Z";
const details = { amount: 1200, debtDate: "2026-10-01", dueDate: "2026-11-01", reportCategory: "ATK" as const, note: "Tagihan", expectedUpdatedAt };
const payment = { amount: 300, paidAt: "2026-10-06", method: "TRANSFER" as const, note: "Koreksi", expectedUpdatedAt };
const tx = {
  $queryRaw: vi.fn(), customer: { updateMany: vi.fn() }, customerReceivable: { findFirst: vi.fn(), updateMany: vi.fn() }, customerReceivablePayment: { updateMany: vi.fn() },
};
const client = tx as never;

describe("koreksi piutang manual", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    tx.$queryRaw.mockResolvedValue([{ id: "c1" }]);
    tx.customerReceivable.findFirst.mockResolvedValue(debt);
    tx.customer.updateMany.mockResolvedValue({ count: 1 });
    tx.customerReceivable.updateMany.mockResolvedValue({ count: 1 });
    tx.customerReceivablePayment.updateMany.mockResolvedValue({ count: 1 });
  });
  it("mengubah rincian dan menyesuaikan total hutang pelanggan dengan selisihnya", async () => {
    await correctReceivable(client, "r1", receivableCorrectionSchema.parse(details), actor);
    expect(tx.$queryRaw.mock.calls[0]).toContain("c1");
    expect(tx.$queryRaw.mock.calls[0]).toContain("store-1");
    expect(tx.customer.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "c1", storeId: "store-1" }), data: { totalDebt: { increment: 200 } } }));
    expect(tx.customerReceivable.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amount: 1200, reportCategory: "ATK" }) }));
  });
  it("memindahkan sisa piutang dan perubahan nominal ke pelanggan tujuan", async () => {
    tx.$queryRaw.mockResolvedValue([{ id: "c1" }, { id: "c2" }]);
    const authorize = vi.fn().mockResolvedValue(undefined);
    await correctReceivable(client, "r1", receivableCorrectionSchema.parse({ ...details, customerId: "c2" }), actor, authorize);
    expect(authorize).toHaveBeenCalledOnce();
    expect(tx.customer.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "c1" }), data: { totalDebt: { increment: -600 } } }));
    expect(tx.customer.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "c2" }), data: { totalDebt: { increment: 800 } } }));
    expect(tx.customerReceivable.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ customerId: "c1" }), data: expect.objectContaining({ customerId: "c2" }) }));
  });
  it("menolak perpindahan tanpa otorisasi pelanggan dan tetap mengizinkan koreksi pelanggan yang sama", async () => {
    await expect(correctReceivable(client, "r1", receivableCorrectionSchema.parse({ ...details, customerId: "c2" }), actor)).rejects.toMatchObject({ status: 403 });
    expect(tx.customer.updateMany).not.toHaveBeenCalled();
    await correctReceivable(client, "r1", receivableCorrectionSchema.parse({ ...details, customerId: "c1" }), actor);
    expect(tx.customerReceivable.updateMany).toHaveBeenCalledOnce();
  });
  it("menolak nominal kurang dari pembayaran atau tanggal hutang setelah pembayaran", async () => {
    await expect(correctReceivable(client, "r1", receivableCorrectionSchema.parse({ ...details, amount: 399 }), actor)).rejects.toMatchObject({ status: 409 });
    await expect(correctReceivable(client, "r1", receivableCorrectionSchema.parse({ ...details, debtDate: "2026-10-06" }), actor)).rejects.toMatchObject({ status: 409 });
    expect(tx.customer.updateMany).not.toHaveBeenCalled();
  });
  it("mengubah pembayaran dan menaikkan saldo pelanggan sebesar selisih yang belum dibayar", async () => {
    await correctReceivablePayment(client, "r1", "p1", receivablePaymentCorrectionSchema.parse(payment), actor);
    expect(tx.customerReceivablePayment.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "p1", receivableId: "r1" }, data: expect.objectContaining({ amount: 300, method: "TRANSFER", paidAt: new Date("2026-10-06T00:00:00Z") }) }));
    expect(tx.customerReceivable.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { amountPaid: { increment: -100 } } }));
    expect(tx.customer.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { totalDebt: { increment: 100 } } }));
  });
  it("menolak pembayaran berlebih, tanggal sebelum hutang, dan data toko lain", async () => {
    await expect(correctReceivablePayment(client, "r1", "p1", receivablePaymentCorrectionSchema.parse({ ...payment, amount: 1000.01 }), actor)).rejects.toMatchObject({ status: 409 });
    await expect(correctReceivablePayment(client, "r1", "p1", receivablePaymentCorrectionSchema.parse({ ...payment, paidAt: "2026-09-30" }), actor)).rejects.toMatchObject({ status: 409 });
    tx.customerReceivable.findFirst.mockResolvedValueOnce(null);
    await expect(correctReceivable(client, "r1", receivableCorrectionSchema.parse(details), actor)).rejects.toMatchObject({ status: 404 });
  });
  it("menolak koreksi rincian dan pembayaran dari piutang yang sudah berubah", async () => {
    tx.customerReceivable.findFirst.mockResolvedValue({ ...debt, updatedAt: new Date("2026-10-05T04:01:00Z") });
    await expect(correctReceivable(client, "r1", receivableCorrectionSchema.parse(details), actor)).rejects.toMatchObject({ status: 409 });
    await expect(correctReceivablePayment(client, "r1", "p1", receivablePaymentCorrectionSchema.parse(payment), actor)).rejects.toMatchObject({ status: 409 });
    expect(tx.customer.updateMany).not.toHaveBeenCalled();
    expect(tx.customerReceivablePayment.updateMany).not.toHaveBeenCalled();
  });
});
