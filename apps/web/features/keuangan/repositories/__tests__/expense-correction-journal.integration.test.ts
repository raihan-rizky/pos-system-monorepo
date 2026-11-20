import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@pos/db";

const enabled = process.env.POS_EXPENSE_CORRECTION_INTEGRATION === "1";
const namespace = crypto.randomUUID();
const storeId = `store-${namespace}`;
const otherStoreId = `other-${namespace}`;
const actorId = `owner-${namespace}`;
const supplierId = `supplier-${namespace}`;

describe.skipIf(!enabled)("jurnal koreksi pengeluaran di PostgreSQL", () => {
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? "");
    if (url.hostname !== "127.0.0.1" || url.port !== "55487" || url.pathname !== "/expense_correction_test") {
      throw new Error("Pengujian harus memakai PostgreSQL sementara khusus koreksi pengeluaran.");
    }
    await db.store.createMany({ data: [{ id: storeId, name: "Toko Uji" }, { id: otherStoreId, name: "Toko Lain" }] });
    await db.supplier.create({ data: { id: supplierId, name: "Pemasok Uji", type: "DISTRIBUTOR" } });
  }, 30_000);

  afterAll(async () => { await db.$disconnect(); });

  function correction(requestId = crypto.randomUUID()) {
    return {
      storeId, requestId, action: "CANCEL" as const, actorId, actorName: "Pemilik Uji",
      subjectKind: "BACKDATED_PURCHASE" as const, subjectId: `purchase-${namespace}`,
      reason: "Pembelian perlu dibatalkan", inputHash: "a".repeat(64), version: "b".repeat(64),
      before: { remainingCents: 61_500_000 }, after: { remainingCents: 0 },
    };
  }

  it("mencatat peninjauan dan penyelesaian dengan identitas permintaan unik per toko", async () => {
    const data = correction();
    const result = await db.expenseCorrection.create({
      data: {
        ...data,
        settlements: {
          create: [{
            paymentKind: "BACKDATED_PAYMENT", paymentId: `payment-${namespace}`,
            kind: "CREDIT", amount: "2000000.00", reference: "NK-1", supplierId,
          }],
        },
      },
      include: { settlements: true },
    });
    expect(result).toMatchObject({ before: data.before, after: data.after, settlements: [{ supplierId, reference: "NK-1" }] });
    await expect(db.expenseCorrection.create({ data })).rejects.toMatchObject({ code: "P2002" });
    await expect(db.expenseCorrection.create({ data: { ...data, storeId: otherStoreId } })).resolves.toMatchObject({
      requestId: data.requestId, storeId: otherStoreId,
    });
  });

  it("menolak penyelesaian dari toko lain dan refund tanpa tanggal", async () => {
    const record = await db.expenseCorrection.create({ data: correction() });
    const refund = {
      correctionId: record.id, paymentKind: "BACKDATED_PAYMENT" as const, paymentId: `payment-${namespace}`,
      kind: "REFUND" as const, amount: "2000000.00", reference: "REF-1",
    };
    await expect(db.expensePaymentSettlement.create({ data: { ...refund, storeId } })).rejects.toThrow();
    await expect(db.expensePaymentSettlement.create({
      data: { ...refund, storeId: otherStoreId, receivedAt: new Date("2026-11-20") },
    })).rejects.toMatchObject({ code: "P2003" });
    await expect(db.expensePaymentSettlement.create({
      data: { ...refund, storeId, receivedAt: new Date("2026-11-20") },
    })).resolves.toMatchObject({ storeId, correctionId: record.id });
  });

  it("membatasi penggunaan kredit pada tagihan di toko yang sama", async () => {
    const record = await db.expenseCorrection.create({ data: correction() });
    const credit = await db.expensePaymentSettlement.create({
      data: {
        correctionId: record.id, storeId, paymentKind: "BACKDATED_PAYMENT", paymentId: `credit-payment-${namespace}`,
        kind: "CREDIT", amount: "2000000.00", reference: "NK-2", supplierId,
      },
    });
    const payable = await db.supplierPayable.create({
      data: {
        id: `payable-other-${namespace}`, storeId: otherStoreId, supplierName: "Pemasok Uji",
        amount: "2500000.00", debtDate: new Date("2026-11-20"), createdById: actorId,
      },
    });
    await expect(db.expenseSupplierCreditApplication.create({
      data: {
        creditId: credit.id, payableId: payable.id, storeId, actorId,
        amount: "1000000.00", requestId: crypto.randomUUID(),
      },
    })).rejects.toMatchObject({ code: "P2003" });
  });
});
