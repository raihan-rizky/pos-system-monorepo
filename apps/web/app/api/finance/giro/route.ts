import { NextResponse } from 'next/server';
import { db } from '@pos/db';
import { apiError } from '@/lib/api/responses';
import { handleAuthError, requirePermission } from '@/lib/rbac/guard';
import { getLogger } from '@/lib/logger';
import { jakartaToday } from '@/features/keuangan/helpers/supplier-payable-input';
import { summarizeGiro } from '@/features/keuangan/helpers/giro-ledger';

export const dynamic = 'force-dynamic';
const log = getLogger('api:finance:giro');
type Payment = { id: string; amount: string; paidAt: string };
type GiroRow = {
  goodsPurchaseId: string; number: string; supplierName: string; amount: string;
  debtDate: string | null; dueDate: string | null; payableId: string | null; payableDebtDate: string | null;
  historyVerifiedAt: Date | null; payableNote: string | null; payments: Payment[];
};
type ManualRow = {
  id: string; supplierName: string; amount: string; debtDate: string;
  dueDate: string | null; note: string | null; payments: Payment[];
};

export async function GET(_request: Request): Promise<Response> {
  try {
    const user = await requirePermission('expense', 'read');
    if (!user.storeId) return apiError('Toko pengguna belum tersedia.', 403, { code: 'Forbidden' });
    const rows = await db.$queryRaw<GiroRow[]>`
      SELECT g."id" AS "goodsPurchaseId", g."number", g."supplierNameSnapshot" AS "supplierName",
        g."totalAmount"::text AS "amount", e."debtDate", g."paymentDueDate"::text AS "dueDate",
        d."id" AS "payableId", d."debtDate"::text AS "payableDebtDate", d."note" AS "payableNote", d."giroHistoryVerifiedAt" AS "historyVerifiedAt", p."payments"
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
      ) e ON true
      LEFT JOIN "pos_supplier_payables" d ON d."goodsPurchaseId" = g."id" AND d."storeId" = g."storeId"
      LEFT JOIN LATERAL (
        SELECT COALESCE(json_agg(json_build_object('id', pay."id", 'amount', pay."amount"::text, 'paidAt', pay."paidAt"::text)
          ORDER BY pay."paidAt", pay."createdAt", pay."id"), '[]'::json) AS "payments"
        FROM "pos_supplier_payable_payments" pay WHERE pay."payableId" = d."id"
      ) p ON true
      WHERE g."storeId" = ${user.storeId} AND g."status" = 'APPROVED' AND g."paymentMethod" = 'GIRO'
        AND (e."debtDate" IS NOT NULL OR EXISTS (
          SELECT 1 FROM "pos_expenses" legacy WHERE legacy."storeId" = g."storeId" AND legacy."deletedAt" IS NULL
            AND (legacy."goodsPurchaseId" = g."id" OR
              (legacy."goodsPurchaseId" IS NULL AND legacy."shoppingRequestId" = g."shoppingRequestId"))
        ))
      ORDER BY g."paymentDueDate" ASC NULLS LAST, g."number", g."id"
    `;
    const manual = await db.$queryRaw<ManualRow[]>`
      SELECT d."id", d."supplierName", d."amount"::text AS "amount", d."debtDate"::text AS "debtDate",
        d."dueDate"::text AS "dueDate", d."note", p."payments"
      FROM "pos_supplier_payables" d
      LEFT JOIN LATERAL (
        SELECT COALESCE(json_agg(json_build_object('id', pay."id", 'amount', pay."amount"::text, 'paidAt', pay."paidAt"::text)
          ORDER BY pay."paidAt", pay."createdAt", pay."id"), '[]'::json) AS "payments"
        FROM "pos_supplier_payable_payments" pay WHERE pay."payableId" = d."id"
      ) p ON true
      WHERE d."storeId" = ${user.storeId} AND d."goodsPurchaseId" IS NULL
      ORDER BY d."debtDate" DESC, d."createdAt" DESC, d."id"
    `;
    const today = jakartaToday();
    const items = rows.map(({ amount, historyVerifiedAt, payments: rawPayments, ...row }) => {
      const payments = rawPayments.map(payment => ({ ...payment, amount: Number(payment.amount) }));
      if (!row.debtDate) return { ...row, amount: Number(amount), payments, status: 'UNKNOWN', paid: null, remaining: null, historyIssue: true };
      try {
        const balance = summarizeGiro(Number(amount), payments, Boolean(historyVerifiedAt), today);
        return { ...row, amount: Number(amount), payments, ...balance, historyIssue: false };
      } catch (error) {
        log.error('Riwayat pembayaran giro tidak konsisten', error);
        return { ...row, amount: Number(amount), payments, status: 'UNKNOWN', paid: null, remaining: null, historyIssue: true };
      }
    });
    const manualPayables = manual.map(({ amount, payments: rawPayments, ...row }) => {
      const payments = rawPayments.map(payment => ({ ...payment, amount: Number(payment.amount) }));
      const paid = payments.reduce((sum, payment) => sum + Math.round(payment.amount * 100), 0) / 100;
      return { ...row, amount: Number(amount), paid, payments };
    });
    return NextResponse.json({ items, manualPayables }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    log.error('Gagal memuat giro', error);
    return apiError('Daftar giro belum dapat dimuat. Silakan coba lagi.', 500, { code: 'InternalError' });
  }
}
