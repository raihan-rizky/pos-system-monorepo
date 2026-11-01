import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildMonthlyPeriod } from '../../helpers/monthly-report-core';

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('@pos/db', () => ({ db: { $queryRaw: mocks.query } }));
import { getMonthlyBalances } from '../monthly-balances';

describe('saldo hutang pemasok bulanan', () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.query.mockResolvedValueOnce([{ opening: '100.00', closing: '90.00' }]);
    mocks.query.mockResolvedValueOnce([{ id: 'linked', date: '2026-10-01', dueDate: '2026-11-20', supplier: 'Pemasok', note: null, amount: '70.00' }, { id: 'manual', date: '2026-09-01', dueDate: null, supplier: 'Lain', note: null, amount: '20.01' }]);
  });
  it('menjumlahkan sisa tiap hutang sekali berdasarkan tanggal pembayaran hingga akhir periode', async () => {
    const now = new Date('2026-12-20T00:00:00Z');
    const result = await getMonthlyBalances('store-1', buildMonthlyPeriod(2026, 11, now), now);
    expect(result.supplierDebtBalance).toBe(90.01);
    expect(result.supplierDebts.map(row => row.id)).toEqual(['linked', 'manual']);
    const sql = (mocks.query.mock.calls[1][0] as TemplateStringsArray).join('?');
    expect(sql).toContain('payment."paidAt" <= ?::date');
    expect(sql).toContain('d."goodsPurchaseId" IS NULL OR d."giroHistoryVerifiedAt" IS NOT NULL');
  });

  it('membaca inventaris dan hutang melalui transaksi yang diberikan', async () => {
    const query = vi.fn().mockResolvedValueOnce([{ opening: '100.00', closing: '90.00' }]).mockResolvedValueOnce([]);
    const now = new Date('2026-12-20T00:00:00Z');
    await getMonthlyBalances('store-1', buildMonthlyPeriod(2026, 11, now), now, { $queryRaw: query } as never);
    expect(query).toHaveBeenCalledTimes(2);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
