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
    const user = await requirePermission('income.manual', 'update');
    if (!user.storeId) return apiError('Toko pengguna belum tersedia.', 403, { code: 'Forbidden' });
    const { id } = await params;
    const where = { id, storeId: user.storeId, deletedAt: null };
    const existing = await db.manualIncome.findFirst({ where, select: { id: true, updatedAt: true, payments: { select: { amount: true } } } });
    if (!existing) return apiError('Pemasukan tidak ditemukan.', 404, { code: 'NotFound' });
    const body: unknown = await request.json().catch(() => null);
    const clientVersion = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>).updatedAt : undefined;
    if (clientVersion !== undefined) {
      if (typeof clientVersion !== 'string' || !Number.isFinite(Date.parse(clientVersion))) return apiError('Versi pemasukan tidak valid.', 422, { code: 'ValidationError' });
      if (Date.parse(clientVersion) !== existing.updatedAt.getTime()) return apiError('Pemasukan sudah berubah. Muat ulang data lalu coba lagi.', 409, { code: 'Conflict' });
    }
    const result = validateManualIncome(body);
    if (!result.success) return apiError('Periksa isian pemasukan.', 422, { code: 'ValidationError', errors: result.errors });
    const { payments, ...income } = result.data;
    const existingPayments = existing.payments ?? [];
    if (!payments && existingPayments.length && existingPayments.reduce((sum, item) => sum + Math.round(Number(item.amount) * 100), 0) !== Math.round(income.amount * 100)) {
      return apiError('Periksa isian pemasukan.', 422, { code: 'ValidationError', errors: { payments: ['Sesuaikan rincian pembayaran dengan nominal pemasukan.'] } });
    }
    const row = await db.manualIncome.update({ where: { ...where, updatedAt: existing.updatedAt }, data: {
      ...income, occurredAt: new Date(`${income.occurredAt}T00:00:00+07:00`),
      ...(payments ? { payments: { deleteMany: {}, create: payments } } : {}),
    }, include: { payments: { select: { method: true, amount: true } } } });
    return NextResponse.json({ data: { ...row, amount: Number(row.amount), payments: (row.payments ?? []).map(payment => ({ ...payment, amount: Number(payment.amount) })) } });
  } catch (error) {
    const auth = handleAuthError(error);
    if (auth) return auth;
    if ((error as { code?: string })?.code === 'P2025') return apiError('Pemasukan sudah berubah. Muat ulang data lalu coba lagi.', 409, { code: 'Conflict' });
    log.error('Failed to update manual income', error);
    return apiError('Pemasukan belum dapat diubah.', 500, { code: 'InternalError' });
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const user = await requirePermission('income.manual', 'delete');
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
