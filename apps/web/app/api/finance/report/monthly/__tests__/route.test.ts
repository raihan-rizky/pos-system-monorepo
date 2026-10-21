import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../route';
const mocks = vi.hoisted(() => ({ permission: vi.fn(), authError: vi.fn(), report: vi.fn() }));
vi.mock('@/lib/rbac/guard', () => ({ requirePermission: mocks.permission, handleAuthError: mocks.authError }));
vi.mock('@/features/financial-report/services/monthly-report', () => ({ getMonthlyFinancialReport: mocks.report }));
vi.mock('@/lib/logger', () => ({ getLogger: () => ({ error: vi.fn() }) }));
describe('endpoint bulanan', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-21T03:00:00Z')); vi.clearAllMocks(); mocks.permission.mockResolvedValue({ storeId: 'authorized-store' }); mocks.authError.mockReturnValue(null); mocks.report.mockResolvedValue({ year: 2026, month: 9 }); });
  afterEach(() => vi.useRealTimers());
  it('memakai permission dan toko sesi, mengabaikan storeId browser serta menonaktifkan cache', async () => {
    const response = await GET(new Request('http://localhost/api/finance/report/monthly?year=2026&month=9&storeId=other'));
    expect(response.status).toBe(200);
    expect(mocks.permission).toHaveBeenCalledWith('financial-report', 'read');
    expect(mocks.report).toHaveBeenCalledWith('authorized-store', 2026, 9);
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
  it.each(['year=2026&month=13', 'year=2026&month=11', 'year=2026&month=1.5', 'year=x&month=9', 'month=9', 'year=2026&month='])('menolak periode tidak sah: %s', async query => {
    const response = await GET(new Request(`http://localhost/api/finance/report/monthly?${query}`));
    expect(response.status).toBe(422); expect(mocks.report).not.toHaveBeenCalled();
  });
  it('tidak mengalihkan pengguna tanpa toko ke toko lain', async () => {
    mocks.permission.mockResolvedValue({ storeId: null });
    expect((await GET(new Request('http://localhost/api/finance/report/monthly?year=2026&month=9'))).status).toBe(403);
    expect(mocks.report).not.toHaveBeenCalled();
  });
  it('meneruskan respons autentikasi dan tidak membaca data', async () => {
    const error = new Error('Unauthorized'); mocks.permission.mockRejectedValue(error); mocks.authError.mockReturnValue(new Response('', { status: 401 }));
    expect((await GET(new Request('http://localhost/api/finance/report/monthly?year=2026&month=9'))).status).toBe(401);
    expect(mocks.report).not.toHaveBeenCalled();
  });
  it('mengembalikan 500 saat sumber gagal', async () => {
    mocks.report.mockRejectedValue(new Error('database unavailable'));
    expect((await GET(new Request('http://localhost/api/finance/report/monthly?year=2026&month=9'))).status).toBe(500);
  });
});
