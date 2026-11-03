import { db } from '@pos/db';
import { NextResponse } from 'next/server';
import { handleAuthError, requirePermission } from '@/lib/rbac/guard';
import { apiError } from '@/lib/api/responses';
import { getLogger } from '@/lib/logger';
import { validateManualIncome } from '@/features/keuangan/helpers/manual-finance';

const log = getLogger('api:finance:income:id');
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  try {
    const user = await requirePermission("income.manual", "update");
    if (!user.storeId) return apiError('Toko pengguna belum tersedia.', 403, { code: 'Forbidden' });
    const { id } = await params;
    const where = { id, storeId: user.storeId, deletedAt: null };
    const existing = await db.manualIncome.findFirst({ where, select: { id: true } });
    if (!existing) return apiError('Pemasukan tidak ditemukan.', 404, { code: 'NotFound' });
    const result = validateManualIncome(await request.json().catch(() => null));
    if (!result.success) return apiError('Periksa isian pemasukan.', 422, { code: 'ValidationError', errors: result.errors });
    const row = await db.manualIncome.update({ where, data: {
      ...result.data, occurredAt: new Date(`${result.data.occurredAt}T00:00:00+07:00`),
    } });
    return NextResponse.json({ data: { ...row, amount: Number(row.amount) } });
  } catch (error) {
    const auth = handleAuthError(error);
    if (auth) return auth;
    if ((error as { code?: string })?.code === 'P2025') return apiError('Pemasukan tidak ditemukan.', 404, { code: 'NotFound' });
    log.error('Failed to update manual income', error);
    return apiError('Pemasukan belum dapat diubah.', 500, { code: 'InternalError' });
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const user = await requirePermission("income.manual", "delete");
    if (!user.storeId) return apiError('Toko pengguna belum tersedia.', 403, { code: 'Forbidden' });
    const { id } = await params;
    const where = { id, storeId: user.storeId, deletedAt: null };
    if (!await db.manualIncome.findFirst({ where, select: { id: true } })) return apiError('Pemasukan tidak ditemukan.', 404, { code: 'NotFound' });
    const row = await db.manualIncome.update({ where, data: { deletedAt: new Date() }, select: { id: true, deletedAt: true } });
    return NextResponse.json({ data: row });
  } catch (error) {
    const auth = handleAuthError(error);
    if (auth) return auth;
    if ((error as { code?: string })?.code === 'P2025') return apiError('Pemasukan tidak ditemukan.', 404, { code: 'NotFound' });
    log.error('Failed to delete manual income', error);
    return apiError('Pemasukan belum dapat dihapus.', 500, { code: 'InternalError' });
  }
}
