import { expect, it, vi } from 'vitest';
import { loadDailyIncome } from '../daily-income';

const mocks = vi.hoisted(() => ({ transactions: vi.fn(), incomes: vi.fn() }));
vi.mock('@pos/db', () => ({ db: { transaction: { findMany: mocks.transactions }, manualIncome: { findMany: mocks.incomes } } }));

it('membaca rincian pembayaran pemasukan aktif pada tanggal dan toko yang dipilih', async () => {
  mocks.transactions.mockResolvedValue([]);
  mocks.incomes.mockResolvedValue([{ id: 'income-1', occurredAt: new Date('2026-11-09T00:00:00+07:00'), category: 'ATK', amount: 100000, payments: [{ method: 'CASH', amount: 40000 }, { method: 'TRANSFER', amount: 60000 }] }]);
  const report = await loadDailyIncome('store-1', '2026-11-09');
  expect(mocks.incomes).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ storeId: 'store-1', deletedAt: null }), select: expect.objectContaining({ payments: expect.anything() }) }));
  expect(report.paymentMethods).toEqual([{ method: 'CASH', amount: 40000 }, { method: 'TRANSFER', amount: 60000 }]);
});
