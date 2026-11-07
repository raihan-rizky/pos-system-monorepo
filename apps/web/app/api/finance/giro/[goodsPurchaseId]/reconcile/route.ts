import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { db } from '@pos/db';
import { apiError } from '@/lib/api/responses';
import { handleAuthError, requirePermission } from '@/lib/rbac/guard';
import { getLogger } from '@/lib/logger';
import { jakartaToday, parseGiroReview } from '@/features/keuangan/helpers/supplier-payable-input';

const log = getLogger('api:finance:giro-review');
type Purchase = { id: string; number: string; supplierName: string; amount: string; debtDate: string; dueDate: string | null };
type Payable = { id: string; amount: string; debtDate: string; goodsPurchaseId: string | null; historyVerifiedAt: Date | null };
type Payment = { amount: string; paidAt: string };

export async function POST(request: Request, context: { params: Promise<{ goodsPurchaseId: string }> }): Promise<Response> {
  try {
    const user = await requirePermission("expense.giro", "update");
    if (!user.storeId) return apiError('Toko pengguna belum tersedia.', 403, { code: 'Forbidden' });
    const input = parseGiroReview(await request.json().catch(() => null));
    if (!input) return apiError('Periksa tanggal, nominal, dan konfirmasi kelengkapan riwayat.', 422, { code: 'ValidationError' });
    const { goodsPurchaseId } = await context.params;
    const result = await db.$transaction(async tx => {
      const [purchase] = await tx.$queryRaw<Purchase[]>`
        SELECT g."id", g."number", g."supplierNameSnapshot" AS "supplierName", (CASE WHEN s."count" > 0 THEN s."giroAmount" ELSE g."totalAmount" END)::text AS "amount",
          e."debtDate", (CASE WHEN s."count" > 0 THEN s."dueDate" ELSE g."paymentDueDate" END)::text AS "dueDate"
        FROM "pos_goods_purchases" g
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS "count", SUM(pay."amount") FILTER (WHERE pay."method"::text = 'GIRO') AS "giroAmount",
          MIN(pay."dueDate") FILTER (WHERE pay."method"::text = 'GIRO') AS "dueDate",
          COALESCE(json_agg(json_build_object('id', pay."id", 'amount', pay."amount"::text, 'dueDate', pay."dueDate"::text, 'note', pay."note")
            ORDER BY pay."dueDate", pay."id") FILTER (WHERE pay."method"::text = 'GIRO'), '[]'::json) AS "schedule"
        FROM "pos_goods_purchase_payments" pay WHERE pay."goodsPurchaseId" = g."id"
      ) s ON true
        JOIN LATERAL (
          SELECT (((x."occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta')::date)::text AS "debtDate"
          FROM "pos_expenses" x
          WHERE x."storeId" = g."storeId" AND x."deletedAt" IS NULL AND x."amount" = g."totalAmount"
            AND (x."goodsPurchaseId" = g."id" OR (x."goodsPurchaseId" IS NULL AND x."shoppingRequestId" = g."shoppingRequestId"
              AND NOT EXISTS (SELECT 1 FROM "pos_goods_purchases" other
                WHERE other."storeId" = g."storeId" AND other."shoppingRequestId" = g."shoppingRequestId"
                  AND (other."status" = 'APPROVED' OR (other."status" = 'CANCELLED' AND other."statusBeforeCancellation" = 'APPROVED')) AND other."id" <> g."id")))
          ORDER BY (x."goodsPurchaseId" = g."id") DESC NULLS LAST, x."occurredAt" ASC LIMIT 1
        ) e ON true
        WHERE g."id" = ${goodsPurchaseId} AND g."storeId" = ${user.storeId}
          AND (g."status" = 'APPROVED' OR (g."status" = 'CANCELLED' AND g."statusBeforeCancellation" = 'APPROVED')) AND ((s."count" > 0 AND s."giroAmount" > 0) OR (s."count" = 0 AND g."paymentMethod" = 'GIRO'))
        FOR UPDATE OF g
      `;
      if (!purchase) return { error: 'not-found' as const };
      const [linked] = await tx.$queryRaw<Payable[]>`
        SELECT "id", "amount"::text, "debtDate"::text, "goodsPurchaseId", "giroHistoryVerifiedAt" AS "historyVerifiedAt"
        FROM "pos_supplier_payables" WHERE "goodsPurchaseId" = ${goodsPurchaseId} AND "storeId" = ${user.storeId} FOR UPDATE
      `;
      if (linked?.historyVerifiedAt || (linked && input.payableId && input.payableId !== linked.id)) return { error: 'conflict' as const };
      let payable = linked;
      if (!payable && input.payableId) {
        [payable] = await tx.$queryRaw<Payable[]>`
          SELECT "id", "amount"::text, "debtDate"::text, "goodsPurchaseId", "giroHistoryVerifiedAt" AS "historyVerifiedAt"
          FROM "pos_supplier_payables" WHERE "id" = ${input.payableId} AND "storeId" = ${user.storeId} FOR UPDATE
        `;
        if (!payable) return { error: 'not-found' as const };
        if (payable.goodsPurchaseId) return { error: 'conflict' as const };
      }
      if (payable && payable.debtDate > purchase.debtDate) return { error: 'date-conflict' as const };
      const debtDate = payable?.debtDate ?? purchase.debtDate;
      const amountCents = Math.round(Number(purchase.amount) * 100);
      if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || purchase.debtDate > jakartaToday()
        || (payable && Math.round(Number(payable.amount) * 100) !== amountCents)
        || input.payments.some(payment => payment.paidAt < debtDate)) return { error: 'invalid' as const };
      const previousPayments = payable ? await tx.$queryRaw<Payment[]>`
        SELECT "amount"::text, "paidAt"::text FROM "pos_supplier_payable_payments" WHERE "payableId" = ${payable.id}
      ` : [];
      if (payable) {
        if (!input.expectedPayments) return { error: 'invalid' as const };
        const previous = previousPayments.map(payment => `${payment.paidAt}:${Math.round(Number(payment.amount) * 100)}`).sort();
        const expected = input.expectedPayments.map(payment => `${payment.paidAt}:${Math.round(payment.amount * 100)}`).sort();
        if (previous.length !== expected.length || previous.some((entry, index) => entry !== expected[index])) {
          return { error: 'history-changed' as const };
        }
      }
      const paidCents = previousPayments.reduce((sum, payment) => sum + Math.round(Number(payment.amount) * 100), 0)
        + input.payments.reduce((sum, payment) => sum + Math.round(payment.amount * 100), 0);
      if (previousPayments.some(payment => payment.paidAt < debtDate || payment.paidAt > jakartaToday())
        || !Number.isSafeInteger(paidCents) || paidCents > amountCents) return { error: 'invalid' as const };
      const payableId = payable?.id ?? randomUUID();
      if (payable) {
        await tx.$executeRaw`
          UPDATE "pos_supplier_payables" SET "goodsPurchaseId" = ${purchase.id}, "giroHistoryVerifiedAt" = NOW(),
            "dueDate" = ${purchase.dueDate}::date
          WHERE "id" = ${payableId} AND "storeId" = ${user.storeId}
        `;
      } else {
        await tx.$executeRaw`
          INSERT INTO "pos_supplier_payables" ("id", "storeId", "goodsPurchaseId", "giroHistoryVerifiedAt", "supplierName", "amount", "debtDate", "dueDate", "createdById")
          VALUES (${payableId}, ${user.storeId}, ${purchase.id}, NOW(), ${purchase.supplierName}, ${Number(purchase.amount)}, ${purchase.debtDate}::date, ${purchase.dueDate}::date, ${user.id})
        `;
      }
      for (const payment of input.payments) await tx.$executeRaw`
        INSERT INTO "pos_supplier_payable_payments" ("id", "payableId", "amount", "paidAt", "createdById")
        VALUES (${randomUUID()}, ${payableId}, ${payment.amount}, ${payment.paidAt}::date, ${user.id})
      `;
      return { payableId };
    });
    if ('error' in result) {
      if (result.error === 'not-found') return apiError('Giro atau hutang pemasok tidak ditemukan.', 404, { code: 'NotFound' });
      if (result.error === 'conflict') return apiError('Giro atau hutang ini sudah terhubung dan telah diperiksa.', 409, { code: 'Conflict' });
      if (result.error === 'date-conflict') return apiError('Tanggal hutang yang dipilih lebih lambat dari tanggal penerimaan. Periksa kembali catatan hutang.', 409, { code: 'Conflict' });
      if (result.error === 'history-changed') return NextResponse.json({ message: 'Riwayat pembayaran telah berubah. Periksa kembali sebelum melanjutkan.', code: 'HistoryChanged' }, { status: 409 });
      return apiError('Nominal hutang atau riwayat pembayaran tidak sesuai. Periksa jumlah dan tanggalnya.', 422, { code: 'ValidationError' });
    }
    return NextResponse.json({ payableId: result.payableId }, { status: 201 });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    log.error('Gagal memeriksa riwayat giro', error);
    return apiError('Riwayat giro belum dapat disimpan. Silakan coba lagi.', 500, { code: 'InternalError' });
  }
}
