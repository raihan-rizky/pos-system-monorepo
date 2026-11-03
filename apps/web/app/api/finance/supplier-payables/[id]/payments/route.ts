import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { db } from '@pos/db';
import { apiError } from '@/lib/api/responses';
import { handleAuthError, requirePermission, requireRole } from '@/lib/rbac/guard';
import { ALL_ROLES } from '@/features/rbac/helpers/rbac-core';
import { getLogger } from '@/lib/logger';
import { jakartaToday, parseAmount, validDate } from '@/features/keuangan/helpers/supplier-payable-input';

const log = getLogger('api:finance:supplier-payable-payments');
type LockedPayable = { amount: string; debtDate: string; goodsPurchaseId: string | null; giroHistoryVerifiedAt: Date | null };
type SavedRequest = { payableId: string; amount: string; paidAt: string; requestExpectedBalance: string | null };
const validRequestKey = (value: string | null): value is string =>
  value !== null && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole(...ALL_ROLES);
    if (!user.storeId) return apiError('Toko pengguna belum tersedia.', 403, { code: 'Forbidden' });
    const body = await request.json().catch(() => null) as { amount?: unknown; paidAt?: unknown; expectedBalance?: unknown } | null;
    const amount = parseAmount(body?.amount);
    if (!amount || !validDate(body?.paidAt) || body.paidAt > jakartaToday()) return apiError('Periksa nominal dan tanggal pembayaran.', 422, { code: 'ValidationError' });
    const paidAt = body.paidAt;
    const requestKey = request.headers.get('Idempotency-Key');
    const { id } = await context.params;
    const expectedBalance = parseAmount(body?.expectedBalance);
    const matchesRequest = (existing: SavedRequest) => {
      const sameBalance = existing.requestExpectedBalance === null
        ? body?.expectedBalance == null
        : expectedBalance !== null && Math.round(Number(existing.requestExpectedBalance) * 100) === Math.round(expectedBalance * 100);
      return existing.payableId === id && Math.round(Number(existing.amount) * 100) === Math.round(amount * 100) && existing.paidAt === paidAt && sameBalance;
    };
    const result = await db.$transaction(async tx => {
      const [debt] = await tx.$queryRaw<LockedPayable[]>`
        SELECT "amount"::text, "debtDate"::text, "goodsPurchaseId", "giroHistoryVerifiedAt" FROM "pos_supplier_payables"
        WHERE "id" = ${id} AND "storeId" = ${user.storeId} FOR UPDATE
      `;
      const authorizedUser = await requirePermission(debt?.goodsPurchaseId ? 'expense.giro' : 'expense.payable', 'update');
      if (authorizedUser.id !== user.id || authorizedUser.storeId !== user.storeId) return 'forbidden' as const;
      if (!debt) return 'not-found' as const;
      let requestScope: string | null = null;
      if (debt.goodsPurchaseId) {
        if (!validRequestKey(requestKey)) return 'invalid-key' as const;
        requestScope = JSON.stringify([user.storeId, requestKey.toLowerCase()]);
        const [existing] = await tx.$queryRaw<SavedRequest[]>`
          SELECT p."payableId", p."amount"::text, p."paidAt"::text, p."requestExpectedBalance"::text FROM "pos_supplier_payable_payments" p
          JOIN "pos_supplier_payables" d ON d."id" = p."payableId"
          WHERE p."requestScope" = ${requestScope} AND d."storeId" = ${user.storeId}
        `;
        if (existing) return matchesRequest(existing) ? 'created' as const : 'conflict' as const;
        if (!expectedBalance) return 'invalid-balance' as const;
      }
      if (debt.goodsPurchaseId && !debt.giroHistoryVerifiedAt) return 'history-unknown' as const;
      if (paidAt < debt.debtDate) return 'invalid' as const;
      const [total] = await tx.$queryRaw<{ paid: string }[]>`
        SELECT COALESCE(SUM("amount"), 0)::text AS paid FROM "pos_supplier_payable_payments" WHERE "payableId" = ${id}
      `;
      const remainingCents = Math.round(Number(debt.amount) * 100) - Math.round(Number(total.paid) * 100);
      if (debt.goodsPurchaseId && Math.round(expectedBalance! * 100) !== remainingCents) return 'balance-changed' as const;
      if (Math.round(amount * 100) > remainingCents) return 'invalid' as const;
      if (requestScope) {
        const inserted = await tx.$queryRaw<{ id: string }[]>`
          INSERT INTO "pos_supplier_payable_payments" ("id", "payableId", "amount", "paidAt", "createdById", "requestScope", "requestExpectedBalance")
          VALUES (${randomUUID()}, ${id}, ${amount}, ${paidAt}::date, ${user.id}, ${requestScope}, ${expectedBalance})
          ON CONFLICT ("requestScope") DO NOTHING RETURNING "id"
        `;
        if (!inserted.length) {
          const [existing] = await tx.$queryRaw<SavedRequest[]>`
            SELECT p."payableId", p."amount"::text, p."paidAt"::text, p."requestExpectedBalance"::text FROM "pos_supplier_payable_payments" p
            JOIN "pos_supplier_payables" d ON d."id" = p."payableId"
            WHERE p."requestScope" = ${requestScope} AND d."storeId" = ${user.storeId}
          `;
          return existing && matchesRequest(existing) ? 'created' as const : 'conflict' as const;
        }
      } else {
        await tx.$executeRaw`
          INSERT INTO "pos_supplier_payable_payments" ("id", "payableId", "amount", "paidAt", "createdById")
          VALUES (${randomUUID()}, ${id}, ${amount}, ${paidAt}::date, ${user.id})
        `;
      }
      return 'created' as const;
    });
    if (result === 'forbidden') return apiError('Sesi pengguna berubah. Muat ulang halaman dan coba lagi.', 403, { code: 'Forbidden' });
    if (result === 'not-found') return apiError('Hutang tidak ditemukan.', 404, { code: 'NotFound' });
    if (result === 'history-unknown') return apiError('Periksa riwayat giro sebelum mencatat pembayaran.', 409, { code: 'Conflict' });
    if (result === 'invalid-key') return apiError('Kunci pembayaran giro tidak tersedia. Muat ulang halaman dan coba lagi.', 422, { code: 'ValidationError' });
    if (result === 'invalid-balance') return apiError('Saldo giro tidak tersedia. Muat ulang halaman dan coba lagi.', 422, { code: 'ValidationError' });
    if (result === 'balance-changed') return NextResponse.json({ message: 'Saldo giro telah berubah. Periksa kembali sebelum mencatat pembayaran.', code: 'BalanceChanged' }, { status: 409 });
    if (result === 'conflict') return apiError('Permintaan pembayaran sudah digunakan untuk data lain. Hubungi pengelola.', 409, { code: 'Conflict' });
    if (result === 'invalid') return apiError('Tanggal pembayaran atau nominal melebihi sisa hutang.', 422, { code: 'ValidationError' });
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    log.error('Gagal menyimpan pembayaran hutang', error);
    return apiError('Pembayaran belum dapat disimpan. Silakan coba lagi.', 500, { code: 'InternalError' });
  }
}
