import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@pos/db";
import {
  addBackdatedPurchasePayment,
  createBackdatedPurchase,
} from "@/features/suppliers/backdated-purchases/repositories/backdated-purchase-repository";
import type { ExpenseCorrectionPreviewInput } from "../../helpers/expense-correction-input";
import { commitBackdatedExpenseCorrection, previewBackdatedExpenseCorrection } from "../backdated-expense-correction-repository";

const enabled = process.env.POS_EXPENSE_CORRECTION_INTEGRATION === "1";
const unique = crypto.randomUUID();
const actor = { id: `owner-${unique}`, name: "Pemilik Uji", storeId: `correction-${unique}` };
const now = new Date("2026-11-20T07:00:00.000Z");
const date = "2026-11-20";

describe.skipIf(!enabled)("koreksi Belanja Terdahulu secara atomik", () => {
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? "");
    if (url.hostname !== "127.0.0.1" || url.port !== "55487" || url.pathname !== "/expense_correction_test") {
      throw new Error("Pengujian harus memakai PostgreSQL sementara khusus koreksi pengeluaran.");
    }
    await db.store.create({ data: { id: actor.storeId, name: "Toko Koreksi Uji" } });
    await db.user.create({
      data: { id: actor.id, name: actor.name, storeId: actor.storeId, username: actor.id, role: "OWNER" },
    });
  }, 30_000);

  afterAll(async () => { await db.$disconnect(); });

  async function fixture() {
    return createBackdatedPurchase({
      requestId: crypto.randomUUID(),
      purchaseDate: "2026-11-01",
      dueDate: "2026-11-25",
      paymentMethod: "GIRO",
      reference: "BT Uji",
      amountCents: 261_500_000,
      payments: [
        { requestId: crypto.randomUUID(), paidAt: "2026-11-05", amountCents: 120_000_000 },
        { requestId: crypto.randomUUID(), paidAt: "2026-11-08", amountCents: 80_000_000 },
      ],
    }, actor);
  }

  it("membatalkan pembayaran terpilih, menyimpan refund, dan mengembalikan hasil untuk pengulangan", async () => {
    const created = await fixture();
    const [first, second] = created.payments;
    const subject = {
      type: "BACKDATED_PURCHASE", id: created.id, payment: { kind: "BACKDATED_PAYMENT", id: second.id },
    } as const;
    const request: ExpenseCorrectionPreviewInput = {
      subject,
      operation: "cancel",
      draft: {
        reason: "Dana pembayaran kedua sudah kembali",
        dispositions: [{ kind: "refund", amountCents: second.amountCents, date, reference: "REF-1", paymentId: second.id }],
      },
    };
    const preview = await previewBackdatedExpenseCorrection(request, actor, now);
    expect(preview).toMatchObject({ blockers: [], impact: { before: { remainingCents: 61_500_000 }, after: { remainingCents: 141_500_000 } } });
    const confirmation = { ...request, version: preview.version, requestId: crypto.randomUUID() };
    const saved = await commitBackdatedExpenseCorrection(confirmation, actor, now);
    await expect(commitBackdatedExpenseCorrection(confirmation, actor, now)).resolves.toEqual(saved);
    const [payments, refunds, due] = await Promise.all([
      db.backdatedPurchasePayment.findMany({ where: { purchaseId: created.id }, orderBy: { paidAt: "asc" } }),
      db.expensePaymentSettlement.findMany({ where: { correctionId: saved.auditId } }),
      db.expense.findUniqueOrThrow({ where: { backdatedPurchaseDueId: created.id } }),
    ]);
    expect(payments).toMatchObject([{ id: first.id, cancelledAt: null }, { id: second.id, cancelledAt: expect.any(Date) }]);
    expect(refunds).toMatchObject([{ kind: "REFUND", paymentId: second.id, reference: "REF-1" }]);
    expect(Number(due.amount)).toBe(1_415_000);
    await expect(addBackdatedPurchasePayment(created.id, {
      requestId: payments[1].requestId, amountCents: second.amountCents, paidAt: second.paidAt,
    }, actor)).rejects.toMatchObject({ status: 409 });
  }, 30_000);

  it("menolak akses toko lain dan pratinjau yang berubah setelah pembayaran baru", async () => {
    const created = await fixture();
    const request: ExpenseCorrectionPreviewInput = {
      subject: { type: "BACKDATED_PURCHASE", id: created.id },
      operation: "edit",
      draft: { reason: "Perbaiki nomor", changes: { reference: "BT Benar" }, dispositions: [] },
    };
    await expect(previewBackdatedExpenseCorrection(request, { ...actor, storeId: "foreign" }, now))
      .rejects.toMatchObject({ status: 404 });
    const preview = await previewBackdatedExpenseCorrection(request, actor, now);
    await addBackdatedPurchasePayment(created.id, {
      requestId: crypto.randomUUID(), amountCents: 10_000_000, paidAt: date,
    }, actor);
    await expect(commitBackdatedExpenseCorrection({
      ...request, version: preview.version, requestId: crypto.randomUUID(),
    }, actor, now)).rejects.toMatchObject({ status: 409 });
    expect(await db.expenseCorrection.count({ where: { subjectId: created.id, storeId: actor.storeId } })).toBe(0);
  }, 30_000);

  it("menahan pembatalan pembelian yang belum diselesaikan", async () => {
    const created = await fixture();
    const request: ExpenseCorrectionPreviewInput = {
      subject: { type: "BACKDATED_PURCHASE", id: created.id },
      operation: "cancel",
      draft: { reason: "Menunggu pengembalian dana", dispositions: [] },
    };
    const preview = await previewBackdatedExpenseCorrection(request, actor, now);
    expect(preview.blockers).toHaveLength(2);
    await expect(commitBackdatedExpenseCorrection({
      ...request, version: preview.version, requestId: crypto.randomUUID(),
    }, actor, now)).rejects.toMatchObject({ status: 409 });
    expect(await db.backdatedPurchase.findUniqueOrThrow({ where: { id: created.id } }))
      .toMatchObject({ cancelledAt: null });
  }, 30_000);
});
