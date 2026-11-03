import { db } from '@pos/db';
import { NextResponse } from 'next/server';
import { handleAuthError, requirePermission } from '@/lib/rbac/guard';
import { apiError, apiList, buildPaginationMeta, parsePagination } from '@/lib/api/responses';
import { getLogger } from '@/lib/logger';
import { validateManualIncome, manualFinanceDateBounds } from '@/features/keuangan/helpers/manual-finance';
import { buildKeuanganMonthRange } from '@/features/keuangan/helpers/keuangan-core';

const log = getLogger('api:finance:income');
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = await requirePermission('income', 'read');
    if (!user.storeId) return apiError('Toko pengguna belum tersedia.', 403, { code: 'Forbidden' });
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month') ?? manualFinanceDateBounds().max.slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return apiError('Pilih bulan dengan format YYYY-MM.', 422, { code: 'ValidationError' });
    const range = buildKeuanganMonthRange(month);
    const { page, limit, skip } = parsePagination(searchParams);
    const where = { storeId: user.storeId, deletedAt: null, occurredAt: { gte: range.start, lt: range.end } };
    const [rows, total] = await Promise.all([
      db.manualIncome.findMany({
        where, skip, take: limit, orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        select: { id: true, description: true, category: true, amount: true, occurredAt: true, createdAt: true, recordedBy: { select: { id: true, name: true } } },
      }),
      db.manualIncome.count({ where }),
    ]);
    return apiList(rows.map(row => ({ ...row, amount: Number(row.amount) })), buildPaginationMeta(total, page, limit));
  } catch (error) {
    const auth = handleAuthError(error);
    if (auth) return auth;
    log.error('Failed to list manual income', error);
    return apiError('Pemasukan belum dapat dimuat.', 500, { code: 'InternalError' });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission('income', 'create');
    if (!user.storeId) return apiError('Toko pengguna belum tersedia.', 403, { code: 'Forbidden' });
    const body: unknown = await request.json().catch(() => null);
    const result = validateManualIncome(body);
    if (!result.success) return apiError('Periksa isian pemasukan.', 422, { code: 'ValidationError', errors: result.errors });
    const row = await db.manualIncome.create({ data: {
      ...result.data, occurredAt: new Date(`${result.data.occurredAt}T00:00:00+07:00`),
      storeId: user.storeId, recordedById: user.id,
    } });
    return NextResponse.json({ data: { ...row, amount: Number(row.amount) } }, { status: 201 });
  } catch (error) {
    const auth = handleAuthError(error);
    if (auth) return auth;
    log.error('Failed to create manual income', error);
    return apiError('Pemasukan belum dapat disimpan.', 500, { code: 'InternalError' });
  }
}
