import { NextResponse } from 'next/server';
import { handleAuthError, requirePermission } from '@/lib/rbac/guard';
import { apiError } from '@/lib/api/responses';
import { getLogger } from '@/lib/logger';
import { buildMonthlyPeriod } from '@/features/financial-report/helpers/monthly-report-core';
import { getMonthlyFinancialReport } from '@/features/financial-report/services/monthly-report';

export const dynamic = 'force-dynamic';
const log = getLogger('api:finance:report:monthly');

export async function GET(request: Request) {
  try {
    const user = await requirePermission('financial-report', 'read');
    if (!user.storeId) return apiError('Toko pengguna belum tersedia.', 403, { code: 'Forbidden' });
    const params = new URL(request.url).searchParams;
    const yearText = params.get('year') || '';
    const monthText = params.get('month') || '';
    const year = Number(yearText);
    const month = Number(monthText);
    try {
      if (!/^\d{4}$/.test(yearText) || !/^\d{1,2}$/.test(monthText)) throw new RangeError();
      buildMonthlyPeriod(year, month);
    } catch {
      return apiError('Pilih tahun dan bulan yang valid. Bulan mendatang belum dapat diekspor.', 422, { code: 'ValidationError' });
    }
    const report = await getMonthlyFinancialReport(user.storeId, year, month);
    return NextResponse.json(report, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    log.error('Gagal menyiapkan laporan keuangan bulanan', error);
    return apiError('Laporan bulanan belum berhasil disiapkan. Silakan coba lagi.', 500, { code: 'InternalError' });
  }
}
