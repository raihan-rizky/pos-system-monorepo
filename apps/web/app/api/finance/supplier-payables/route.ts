import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { db } from '@pos/db';
import { apiError } from '@/lib/api/responses';
import { canAuthenticatedUserAccessPage, handleAuthError, requirePermission } from '@/lib/rbac/guard';
import { getLogger } from '@/lib/logger';
import { jakartaToday, parsePayable } from '@/features/keuangan/helpers/supplier-payable-input';
import { projectPayableLedger, type ManualPayablePayment } from '@/features/keuangan/helpers/payable-ledger';
import { isPayableRequestKey, lockPayableAttempt, payableFingerprint, payableRequestScope, reauthorizePayableActor } from '@/features/keuangan/services/manual-payable-attempt';
import { permitSystemPayablePayment } from '@/features/keuangan/services/payable-system-payment';

export const dynamic = 'force-dynamic';
const log = getLogger('api:finance:supplier-payables');
type Row = { id: string; ledgerVersion: string; supplierName: string; amount: string; paid: string; debtDate: string; dueDate: string | null; note: string | null; reportCategory: string | null; total: bigint;
  payments?: Array<{ id: string; amount: string; paidAt: string; origin: ManualPayablePayment['origin']; allocated: boolean }> };

export async function GET(request: Request) {
  try {
    const user = await requirePermission("expense.payable", "read");
    if (!user.storeId) return apiError('Toko pengguna belum tersedia.', 403, { code: 'Forbidden' });
    if (!await canAuthenticatedUserAccessPage(user, '/keuangan')) return apiError('Akses halaman Keuangan diperlukan.', 403, { code: 'Forbidden' });
    const requestedPage = Number(new URL(request.url).searchParams.get('page') || '1');
    const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 100000) : 1;
    const today = jakartaToday();
    const rows = await db.$queryRaw<Row[]>`
      SELECT d."id", (d."ledgerVersion"::numeric * 2 + CASE WHEN d."dueDate" IS NOT NULL AND d."dueDate" <= ${today}::date THEN 1 ELSE 0 END)::text AS "ledgerVersion", d."supplierName", d."amount"::text, d."debtDate"::text, d."dueDate"::text, d."note", d."reportCategory",
        (CASE WHEN d."dueDate" IS NOT NULL AND d."dueDate" <= ${today}::date THEN d."amount" ELSE COALESCE(p.paid, 0) END)::text AS paid, p.payments, COUNT(*) OVER() AS total
      FROM "pos_supplier_payables" d
      LEFT JOIN LATERAL (
        SELECT SUM(pay."amount") AS paid, COALESCE(json_agg(json_build_object('id', pay."id", 'amount', pay."amount"::text,
          'paidAt', pay."paidAt"::text, 'origin', pay."origin"::text,
          'allocated', EXISTS (SELECT 1 FROM "pos_manual_transfer_allocations" a WHERE a."paymentId" = pay."id")) ORDER BY pay."paidAt", pay."id"), '[]'::json) AS payments
        FROM "pos_supplier_payable_payments" pay WHERE pay."payableId" = d."id"
      ) p ON true
      WHERE d."storeId" = ${user.storeId} AND d."goodsPurchaseId" IS NULL
      ORDER BY (d."amount" > CASE WHEN d."dueDate" IS NOT NULL AND d."dueDate" <= ${today}::date THEN d."amount" ELSE COALESCE(p.paid, 0) END) DESC, d."debtDate" DESC, d."createdAt" DESC, d."id"
      LIMIT 20 OFFSET ${(page - 1) * 20}
    `;
    const total = rows.length ? rows[0].total : (await db.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(*) AS total FROM "pos_supplier_payables" d
      WHERE d."storeId" = ${user.storeId} AND d."goodsPurchaseId" IS NULL
    `)[0]?.total ?? 0;
    const items = rows.map(({ total: _total, amount, paid, payments, ...row }) => {
      const ledger = projectPayableLedger({ payableId: row.id, amountCents: Math.round(Number(amount) * 100), debtDate: row.debtDate,
        dueDate: row.dueDate, todayWib: today, payments: (payments ?? []).map(payment => ({ ...payment, amountCents: Math.round(Number(payment.amount) * 100) })) });
      return { ...row, amount: Number(amount), paid: Number(paid), payments: ledger.payments.map(payment => ({ id: payment.id, amount: payment.amountCents / 100, paidAt: payment.paidAt, origin: payment.origin,
        allocated: payments?.find(stored => stored.id === payment.id)?.allocated ?? false })) };
    }, { isolationLevel: 'ReadCommitted' });
    return NextResponse.json({ items, page, total: Number(total) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    log.error('Gagal memuat hutang pemasok', error);
    return apiError('Hutang belum dapat dimuat. Silakan coba lagi.', 500, { code: 'InternalError' });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission("expense.payable", "create");
    if (!user.storeId) return apiError('Toko pengguna belum tersedia.', 403, { code: 'Forbidden' });
    if (!await canAuthenticatedUserAccessPage(user, '/keuangan')) return apiError('Akses halaman Keuangan diperlukan.', 403, { code: 'Forbidden' });
    const input = parsePayable(await request.json().catch(() => null));
    if (!input) return apiError('Periksa pemasok, kategori, nominal, tanggal, dan pembayaran hutang.', 422, { code: 'ValidationError' });
    const key = request.headers.get('Idempotency-Key');
    if (!isPayableRequestKey(key)) return apiError('Kunci percobaan hutang tidak valid.', 422, { code: 'ValidationError' });
    if (input.initialPayment !== null) {
      for (const action of ['read', 'update'] as const) {
        const authorized = await requirePermission('expense.payable', action);
        if (authorized.id !== user.id || authorized.storeId !== user.storeId || authorized.role !== user.role) return apiError('Sesi pengguna berubah. Muat ulang dan coba lagi.', 403, { code: 'Forbidden' });
      }
    }
    const actor = { id: user.id, storeId: user.storeId };
    const scope = payableRequestScope(actor, key);
    const fingerprint = payableFingerprint(input);
    const result = await db.$transaction(async tx => {
      const attempt = await lockPayableAttempt(tx, actor);
      if (!await reauthorizePayableActor(tx, user, input.initialPayment !== null)) return { kind: 'forbidden' as const };
      const [existing] = await tx.$queryRaw<{ id: string; fingerprint: string; available: boolean; linked: boolean }[]>`
        SELECT r."payableId" AS id, r."fingerprint",
          EXISTS (SELECT 1 FROM "pos_supplier_payables" d WHERE d."id" = r."payableId" AND d."storeId" = r."storeId") AS available,
          EXISTS (SELECT 1 FROM "pos_supplier_payable_manual_links" l WHERE l."manualPayableId" = r."payableId" AND l."storeId" = r."storeId") AS linked
        FROM "pos_manual_payable_requests" r WHERE r."scope" = ${scope}
      `;
      if (existing) {
        if (existing.fingerprint !== fingerprint) return { kind: 'conflict' as const };
        if (!existing.available) return { kind: existing.linked ? 'linked' as const : 'unavailable' as const };
        return { kind: 'existing' as const, id: existing.id };
      }
      if (!attempt || attempt.key !== key.toLowerCase() || attempt.body !== JSON.stringify(input) || attempt.completedAt) return { kind: 'conflict' as const };
      const id = randomUUID();
      await tx.$executeRaw`
        INSERT INTO "pos_supplier_payables" ("id", "storeId", "supplierName", "amount", "debtDate", "dueDate", "note", "reportCategory", "createdById")
        VALUES (${id}, ${user.storeId}, ${input.supplierName}, ${input.amount}, ${input.debtDate}::date, ${input.dueDate}::date, ${input.note}, ${input.reportCategory}::"ManualExpenseReportCategory", ${user.id})
      `;
      await tx.$executeRaw`INSERT INTO "pos_manual_payable_requests" ("scope", "fingerprint", "payableId", "storeId", "userId") VALUES (${scope}, ${fingerprint}, ${id}, ${actor.storeId}, ${actor.id})`;
      if (input.initialPayment !== null) {
        await permitSystemPayablePayment(tx);
        await tx.$executeRaw`
          INSERT INTO "pos_supplier_payable_payments" ("id", "payableId", "amount", "paidAt", "createdById")
          VALUES (${randomUUID()}, ${id}, ${input.initialPayment}, ${input.initialPaidAt}::date, ${user.id})
        `;
      }
      await tx.$executeRaw`UPDATE "pos_manual_payable_attempts" SET "completedAt" = CURRENT_TIMESTAMP WHERE "storeId" = ${actor.storeId} AND "userId" = ${actor.id} AND "key" = ${key.toLowerCase()}`;
      return { kind: 'created' as const, id };
    });
    if (result.kind === 'forbidden') return apiError('Sesi atau izin pengguna berubah. Muat ulang dan coba lagi.', 403, { code: 'Forbidden' });
    if (result.kind === 'conflict') return apiError('Percobaan hutang berubah atau kunci sudah digunakan untuk data lain. Periksa kembali.', 409, { code: 'Conflict' });
    if (result.kind === 'linked' || result.kind === 'unavailable') return NextResponse.json({ processed: true, status: result.kind }, { status: 200 });
    return NextResponse.json({ id: result.id }, { status: result.kind === 'created' ? 201 : 200 });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    log.error('Gagal menyimpan hutang pemasok', error);
    return apiError('Hutang belum dapat disimpan. Silakan coba lagi.', 500, { code: 'InternalError' });
  }
}
