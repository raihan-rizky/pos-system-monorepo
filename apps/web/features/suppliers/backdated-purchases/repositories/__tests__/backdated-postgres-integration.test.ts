import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@pos/db";
import { addHistoricalPayment, createHistoricalPurchase } from "../../services/backdated-purchase-service";
import { listMergedPurchases } from "../backdated-purchase-list";

const integration = process.env.BACKDATED_DB_INTEGRATION === "1" ? describe : describe.skip;
const marker = `backdated-test-${randomUUID()}`;
let actor: { id: string; storeId: string; name: string };
let purchaseId = "";
let ordinaryId = "";
const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

integration("integrasi PostgreSQL belanja terdahulu", () => {
  beforeAll(async () => {
    const user = await db.user.findFirst({ where: { isActive: true, storeId: { not: null } }, select: { id: true, storeId: true, name: true } });
    if (!user?.storeId) throw new Error("Pengguna toko pengujian tidak tersedia");
    actor = { id: user.id, storeId: user.storeId, name: user.name };
  });

  afterAll(async () => {
    if (purchaseId) {
      await db.expense.deleteMany({ where: { OR: [{ backdatedPurchaseDueId: purchaseId }, { backdatedPurchasePayment: { purchaseId } }] } });
      await db.backdatedPurchasePayment.deleteMany({ where: { purchaseId } });
      await db.backdatedPurchase.deleteMany({ where: { id: purchaseId } });
    }
    if (ordinaryId) await db.shoppingRequest.deleteMany({ where: { id: ordinaryId } });
    await db.$disconnect();
  });

  it("mencatat Rp10 juta secara tepat sekali dan menolak pembayaran bersamaan yang melebihi saldo", async () => {
    const purchase = await createHistoricalPurchase({
      requestId: marker, purchaseDate: "2026-09-01", dueDate: "2026-10-15",
      paymentMethod: "GIRO", reference: marker, amount: "10000000",
      payments: [{ requestId: `${marker}-initial`, amount: "4000000", paidAt: "2026-10-01" }],
    }, actor);
    purchaseId = purchase.id;
    const body = { requestId: `${marker}-second`, amount: "2000000", paidAt: "2026-10-10" };
    const results = await Promise.all([addHistoricalPayment(purchaseId, body, actor), addHistoricalPayment(purchaseId, body, actor)]);
    expect(results.every(result => result.paidCents === 600_000_000)).toBe(true);

    const competing = await Promise.allSettled([
      addHistoricalPayment(purchaseId, { requestId: `${marker}-compete-a`, amount: "3000000", paidAt: "2026-10-16" }, actor),
      addHistoricalPayment(purchaseId, { requestId: `${marker}-compete-b`, amount: "3000000", paidAt: "2026-10-16" }, actor),
    ]);
    expect(competing.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(competing.filter(result => result.status === "rejected")).toHaveLength(1);

    const expenses = await db.expense.findMany({
      where: { OR: [{ backdatedPurchaseDueId: purchaseId }, { backdatedPurchasePayment: { purchaseId } }] },
      select: { amount: true, occurredAt: true, backdatedPurchaseDueId: true },
    });
    expect(expenses).toHaveLength(3);
    expect(expenses.reduce((total, row) => total + Number(row.amount), 0)).toBe(10_000_000);
    const due = expenses.find(row => row.backdatedPurchaseDueId === purchaseId);
    expect(Number(due?.amount)).toBe(4_000_000);
    expect(due?.occurredAt.toISOString()).toBe("2026-10-14T17:00:00.000Z");

    await expect(db.backdatedPurchasePayment.create({
      data: { purchaseId, requestId: `${marker}-invalid`, amount: -1, paidAt: date("2026-10-01"), createdById: actor.id },
    })).rejects.toThrow();
  }, 30_000);

  it("menggabungkan filter dan halaman daftar dengan batas toko", async () => {
    const ordinary = await db.shoppingRequest.create({ data: {
      storeId: actor.storeId, number: marker, name: marker, normalizedName: marker, sequence: 1,
    } });
    ordinaryId = ordinary.id;
    const base = { storeId: actor.storeId, q: marker, skip: 0, take: 1 };
    const first = await listMergedPurchases(base);
    const second = await listMergedPurchases({ ...base, skip: 1 });
    expect(first.total).toBe(2);
    expect(second.total).toBe(2);
    expect(new Set([...first.requests, ...second.requests].map(row => row.kind))).toEqual(new Set(["SHOPPING_REQUEST", "BACKDATED_PURCHASE"]));
    const partial = await listMergedPurchases({ ...base, take: 10, recordType: "BACKDATED_PURCHASE", paymentStatus: "PARTIAL", paymentMethod: "GIRO", paymentDueDate: "2026-10-15" });
    expect(partial.total).toBe(1);
    expect(partial.requests[0].id).toBe(purchaseId);
    const otherStore = await listMergedPurchases({ ...base, storeId: `${marker}-different-store` });
    expect(otherStore.total).toBe(0);
  }, 30_000);
});
