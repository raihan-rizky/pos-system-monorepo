import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { db } from '@pos/db';
import { apiError } from '@/lib/api/responses';
import { handleAuthError, requirePermission } from '@/lib/rbac/guard';
import { getLogger } from '@/lib/logger';
import { jakartaToday, parseAmount, validDate } from '@/features/keuangan/helpers/supplier-payable-input';

const log = getLogger('api:finance:supplier-payable-payments');
type LockedPayable = { amount: string; debtDate: string };

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission('expense', 'update');
    if (!user.storeId) return apiError('Toko pengguna belum tersedia.', 403, { code: 'Forbidden' });
    const body = await request.json().catch(() => null) as { amount?: unknown; paidAt?: unknown } | null;
    const amount = parseAmount(body?.amount);
    if (!amount || !validDate(body?.paidAt) || body.paidAt > jakartaToday()) return apiError('Periksa nominal dan tanggal pembayaran.', 422, { code: 'ValidationError' });
    const paidAt = body.paidAt;
    const { id } = await context.params;
    const result = await db.$transaction(async tx => {
      const [debt] = await tx.$queryRaw<LockedPayable[]>`
        SELECT "amount"::text, "debtDate"::text FROM "pos_supplier_payables"
        WHERE "id" = ${id} AND "storeId" = ${user.storeId} FOR UPDATE
      `;
      if (!debt) return 'not-found' as const;
      if (paidAt < debt.debtDate) return 'invalid' as const;
      const [total] = await tx.$queryRaw<{ paid: string }[]>`
        SELECT COALESCE(SUM("amount"), 0)::text AS paid FROM "pos_supplier_payable_payments" WHERE "payableId" = ${id}
      `;
      const remainingCents = Math.round(Number(debt.amount) * 100) - Math.round(Number(total.paid) * 100);
      if (Math.round(amount * 100) > remainingCents) return 'invalid' as const;
      await tx.$executeRaw`
        INSERT INTO "pos_supplier_payable_payments" ("id", "payableId", "amount", "paidAt", "createdById")
        VALUES (${randomUUID()}, ${id}, ${amount}, ${paidAt}::date, ${user.id})
      `;
      return 'created' as const;
    });
    if (result === 'not-found') return apiError('Hutang tidak ditemukan.', 404, { code: 'NotFound' });
    if (result === 'invalid') return apiError('Tanggal pembayaran atau nominal melebihi sisa hutang.', 422, { code: 'ValidationError' });
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    log.error('Gagal menyimpan pembayaran hutang', error);
    return apiError('Pembayaran belum dapat disimpan. Silakan coba lagi.', 500, { code: 'InternalError' });
  }
}
