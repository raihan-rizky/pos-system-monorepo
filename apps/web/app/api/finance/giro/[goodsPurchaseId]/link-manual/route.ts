import { NextResponse } from 'next/server';
import { db } from '@pos/db';
import { apiError } from '@/lib/api/responses';
import { handleAuthError, requirePermission } from '@/lib/rbac/guard';
import { getLogger } from '@/lib/logger';
import { parseGiroLinkManual, planGiroLink } from '@/features/keuangan/helpers/giro-link-manual';
import { jakartaToday } from '@/features/keuangan/helpers/supplier-payable-input';

const log = getLogger('api:finance:giro-link-manual');

type Purchase = { id: string; supplierName: string; amount: string; debtDate: string | null; dueDate: string | null };
type Payable = {
  id: string; supplierName: string; amount: string; debtDate: string; dueDate: string | null; note: string | null;
  goodsPurchaseId: string | null; historyVerifiedAt: Date | null;
};
type Payment = { id: string; payableId: string; amount: string; paidAt: string; requestScope: string | null };
type Audit = { manualPayableId: string; storeId: string; goodsPurchaseId: string; giroPayableId: string; sameRequest: boolean };
type ErrorCode = 'NotFound' | 'HistoryChanged' | 'PotentialDuplicate' | 'Conflict';

class LinkError extends Error {
  constructor(readonly code: ErrorCode, message: string) { super(message); }
}

const historyChanged = () => new LinkError('HistoryChanged', 'Data hutang atau riwayat pembayaran telah berubah. Muat ulang dan periksa kembali.');
const notFound = () => new LinkError('NotFound', 'Giro atau hutang tidak ditemukan di toko ini.');
const conflict = (message: string) => new LinkError('Conflict', message);
const sameAmount = (a: string | number, b: string | number) => Math.round(Number(a) * 100) === Math.round(Number(b) * 100);

export async function POST(request: Request, context: { params: Promise<{ goodsPurchaseId: string }> }): Promise<Response> {
  try {
    const user = await requirePermission("expense.giro", "update");
    if (!user.storeId) return apiError('Toko pengguna belum tersedia.', 403, { code: 'Forbidden' });
    const input = parseGiroLinkManual(await request.json().catch(() => null));
    if (!input || input.payableId === input.expectedGiroPayableId) {
      return apiError('Periksa data hutang, pembayaran, dan konfirmasi riwayat.', 422, { code: 'ValidationError' });
    }
    const { goodsPurchaseId } = await context.params;
    const storeId = user.storeId;
    const requestPayload = JSON.stringify(input);
    const result = await db.$transaction(async tx => {
      await tx.$executeRaw`SET LOCAL lock_timeout = '2s'`;
      await tx.$executeRaw`SET LOCAL statement_timeout = '3s'`;
      // Freeze the rows and possible new matching expenses used by GET while
      // this short transaction validates its displayed purchase snapshot.
      await tx.$executeRaw`LOCK TABLE "pos_goods_purchases", "pos_expenses" IN SHARE MODE`;
      // Prevent concurrent FK DDL from changing the safety check before deletion.
      await tx.$executeRaw`LOCK TABLE "pos_supplier_payables" IN ROW EXCLUSIVE MODE`;
      const [purchase] = await tx.$queryRaw<Purchase[]>`
        SELECT g."id", g."supplierNameSnapshot" AS "supplierName", g."totalAmount"::text AS "amount",
          e."debtDate", g."paymentDueDate"::text AS "dueDate"
        FROM "pos_goods_purchases" g
        LEFT JOIN LATERAL (
          SELECT (((x."occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta')::date)::text AS "debtDate"
          FROM "pos_expenses" x
          WHERE x."storeId" = g."storeId" AND x."deletedAt" IS NULL AND x."amount" = g."totalAmount"
            AND (x."goodsPurchaseId" = g."id" OR (x."goodsPurchaseId" IS NULL AND x."shoppingRequestId" = g."shoppingRequestId"
              AND NOT EXISTS (SELECT 1 FROM "pos_goods_purchases" other
                WHERE other."storeId" = g."storeId" AND other."shoppingRequestId" = g."shoppingRequestId"
                  AND other."status" = 'APPROVED' AND other."id" <> g."id")))
          ORDER BY (x."goodsPurchaseId" = g."id") DESC NULLS LAST, x."occurredAt" ASC LIMIT 1
          FOR SHARE OF x
        ) e ON true
        WHERE g."id" = ${goodsPurchaseId} AND g."storeId" = ${storeId} AND g."status" = 'APPROVED' AND g."paymentMethod" = 'GIRO'
        FOR UPDATE OF g
      `;
      if (!purchase) throw notFound();

      const [audit] = await tx.$queryRaw<Audit[]>`
        SELECT "manualPayableId", "storeId", "goodsPurchaseId", "giroPayableId", "requestPayload" = ${requestPayload}::jsonb AS "sameRequest"
        FROM "pos_supplier_payable_manual_links" WHERE "manualPayableId" = ${input.payableId}
      `;
      if (audit) {
        if (audit.storeId !== storeId) throw notFound();
        if (audit.goodsPurchaseId !== goodsPurchaseId || audit.giroPayableId !== input.expectedGiroPayableId || !audit.sameRequest) {
          throw conflict('Hutang ini sudah ditautkan dengan data yang berbeda. Muat ulang halaman.');
        }
        return { payableId: audit.giroPayableId, replay: true };
      }

      const debts = await tx.$queryRaw<Payable[]>`
        SELECT "id", "supplierName", "amount"::text AS "amount", "debtDate"::text AS "debtDate", "dueDate"::text AS "dueDate", "note",
          "goodsPurchaseId", "giroHistoryVerifiedAt" AS "historyVerifiedAt"
        FROM "pos_supplier_payables"
        WHERE "storeId" = ${storeId} AND "id" IN (${input.payableId}, ${input.expectedGiroPayableId})
        ORDER BY "id" FOR UPDATE
      `;
      const giro = debts.find(debt => debt.id === input.expectedGiroPayableId);
      const manual = debts.find(debt => debt.id === input.payableId);
      if (!giro || !manual) throw notFound();
      if (giro.goodsPurchaseId !== goodsPurchaseId || !giro.historyVerifiedAt || manual.goodsPurchaseId !== null) {
        throw conflict('Status giro atau hutang telah berubah. Muat ulang halaman.');
      }
      if (!sameAmount(purchase.amount, input.expectedGiro.amount) || !sameAmount(giro.amount, input.expectedGiro.amount)
        || purchase.debtDate !== input.expectedGiro.debtDate || giro.debtDate !== input.expectedGiro.payableDebtDate
        || purchase.dueDate !== input.expectedGiro.dueDate || purchase.supplierName !== input.expectedGiro.supplierName || giro.note !== input.expectedGiro.payableNote
        || !sameAmount(manual.amount, input.expectedManual.amount) || manual.debtDate !== input.expectedManual.debtDate
        || manual.dueDate !== input.expectedManual.dueDate || manual.supplierName !== input.expectedManual.supplierName || manual.note !== input.expectedManual.note) {
        throw historyChanged();
      }
      if (!sameAmount(giro.amount, manual.amount) || !purchase.debtDate) {
        throw conflict('Nominal atau tanggal hutang tidak sesuai. Periksa kembali sebelum menautkan.');
      }

      // Only these exact FK columns are understood by this merge; reject any new
      // referencing column, regardless of its ON DELETE behavior.
      const unknownReferences = await tx.$queryRaw<{ constraint: string }[]>`
        SELECT c.conname AS "constraint" FROM pg_catalog.pg_constraint c
        WHERE c.contype = 'f' AND c.confrelid = '"pos_supplier_payables"'::regclass
          AND NOT (
            c.confdeltype IN ('r', 'a') AND cardinality(c.confkey) = 1 AND c.confkey[1] =
              (SELECT attnum FROM pg_catalog.pg_attribute WHERE attrelid = c.confrelid AND attname = 'id') AND (
            (c.conrelid = '"pos_supplier_payable_payments"'::regclass AND cardinality(c.conkey) = 1 AND c.conkey[1] =
              (SELECT attnum FROM pg_catalog.pg_attribute WHERE attrelid = c.conrelid AND attname = 'payableId'))
            OR (c.conrelid = '"pos_supplier_payable_manual_links"'::regclass AND cardinality(c.conkey) = 1 AND c.conkey[1] =
              (SELECT attnum FROM pg_catalog.pg_attribute WHERE attrelid = c.conrelid AND attname = 'giroPayableId')))
          ) LIMIT 1
      `;
      if (unknownReferences.length) throw conflict('Hutang memiliki hubungan data lain yang perlu diperiksa. Hubungi bantuan.');
      const existingLinks = await tx.$queryRaw<{ exists: number }[]>`
        SELECT 1 AS "exists" FROM "pos_supplier_payable_manual_links" WHERE "giroPayableId" = ${manual.id} LIMIT 1
      `;
      if (existingLinks.length) throw conflict('Hutang sudah memiliki riwayat penautan. Hubungi bantuan.');
      const payments = await tx.$queryRaw<Payment[]>`
        SELECT "id", "payableId", "amount"::text AS "amount", "paidAt"::text AS "paidAt", "requestScope"
        FROM "pos_supplier_payable_payments" WHERE "payableId" IN (${giro.id}, ${manual.id}) ORDER BY "id" FOR UPDATE
      `;
      const plan = planGiroLink({
        amount: giro.amount, giroDebtDate: giro.debtDate, manualDebtDate: manual.debtDate,
        giroPayments: payments.filter(payment => payment.payableId === giro.id),
        manualPayments: payments.filter(payment => payment.payableId === manual.id),
      }, input, jakartaToday());
      if ('error' in plan) {
        if (plan.error === 'history-changed') throw historyChanged();
        if (plan.error === 'potential-duplicate') throw new LinkError('PotentialDuplicate', 'Ada pembayaran dengan tanggal dan nominal sama. Periksa dan konfirmasi jika pembayaran tersebut berbeda.');
        if (plan.error === 'protected-payment') throw conflict('Pembayaran ini dilindungi oleh kunci transaksi dan tidak dapat dihapus sebagai duplikat. Hubungi bantuan.');
        throw conflict('Nominal, pasangan pembayaran, atau tanggal hutang tidak sesuai. Periksa kembali.');
      }

      if (plan.duplicateManualIds.length) {
        // A future FK may cascade or set references to null when a duplicate is
        // deleted. Block concurrent FK DDL until the safety check and delete finish.
        await tx.$executeRaw`LOCK TABLE "pos_supplier_payable_payments" IN ROW EXCLUSIVE MODE`;
        const paymentReferences = await tx.$queryRaw<{ constraint: string }[]>`
          SELECT c.conname AS "constraint" FROM pg_catalog.pg_constraint c
          WHERE c.contype = 'f' AND c.confrelid = '"pos_supplier_payable_payments"'::regclass LIMIT 1
        `;
        if (paymentReferences.length) throw conflict('Pembayaran memiliki hubungan data lain yang perlu diperiksa. Hubungi bantuan.');
      }

      const inserted = await tx.$executeRaw`
        INSERT INTO "pos_supplier_payable_manual_links" (
          "manualPayableId", "giroPayableId", "storeId", "goodsPurchaseId", "linkedById", "manualPayable", "giroPayable",
          "manualPayments", "giroPayments", "duplicatePayments", "requestPayload", "matchingPaymentsConfirmedDistinct"
        )
        SELECT m."id", g."id", ${storeId}, ${goodsPurchaseId}, ${user.id}, to_jsonb(m), to_jsonb(g),
          COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p."id") FROM "pos_supplier_payable_payments" p WHERE p."payableId" = m."id"), '[]'::jsonb),
          COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p."id") FROM "pos_supplier_payable_payments" p WHERE p."payableId" = g."id"), '[]'::jsonb),
          ${JSON.stringify(input.duplicatePayments)}::jsonb, ${requestPayload}::jsonb, ${input.matchingPaymentsConfirmedDistinct}
        FROM "pos_supplier_payables" m, "pos_supplier_payables" g WHERE m."id" = ${manual.id} AND g."id" = ${giro.id}
      `;
      if (inserted !== 1) throw historyChanged();
      for (const id of plan.duplicateManualIds) {
        const deleted = await tx.$executeRaw`DELETE FROM "pos_supplier_payable_payments" WHERE "id" = ${id} AND "payableId" = ${manual.id} AND "requestScope" IS NULL`;
        if (deleted !== 1) throw historyChanged();
      }
      await tx.$executeRaw`UPDATE "pos_supplier_payable_payments" SET "payableId" = ${giro.id} WHERE "payableId" = ${manual.id}`;
      const mergedNote = giro.note !== null && manual.note !== null
        ? `Catatan giro:\n${giro.note}\n\nCatatan hutang manual:\n${manual.note}`
        : giro.note ?? manual.note;
      await tx.$executeRaw`UPDATE "pos_supplier_payables" SET "debtDate" = ${plan.debtDate}::date, "note" = ${mergedNote} WHERE "id" = ${giro.id} AND "storeId" = ${storeId}`;
      const deleted = await tx.$executeRaw`DELETE FROM "pos_supplier_payables" WHERE "id" = ${manual.id} AND "storeId" = ${storeId}`;
      if (deleted !== 1) throw historyChanged();
      return { payableId: giro.id, replay: false };
    }, { isolationLevel: 'ReadCommitted', timeout: 5000 });
    return NextResponse.json({ payableId: result.payableId }, { status: result.replay ? 200 : 201 });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    if (error instanceof LinkError) return NextResponse.json({ message: error.message, code: error.code }, { status: error.code === 'NotFound' ? 404 : 409 });
    // Concurrent updates or FK checks can invalidate the confirmation. The
    // transaction was rolled back; ask the user to refresh.
    if (error && typeof error === 'object' && 'code' in error) {
      const prismaError = error as { code: unknown; meta?: { code?: unknown } };
      if (prismaError.code === 'P2010' && ['55P03', '57014'].includes(String(prismaError.meta?.code))) {
        return apiError('Data sedang digunakan. Tunggu sebentar lalu coba lagi.', 409, { code: 'Conflict' });
      }
      if (prismaError.code === 'P2034' || (prismaError.code === 'P2010'
        && ['40001', '40P01', '23001', '23503'].includes(String(prismaError.meta?.code)))) {
        const changed = historyChanged();
        return NextResponse.json({ message: changed.message, code: changed.code }, { status: 409 });
      }
    }
    log.error('Gagal menautkan hutang manual ke giro', error);
    return apiError('Hutang belum dapat ditautkan. Silakan muat ulang dan coba lagi.', 500, { code: 'InternalError' });
  }
}
