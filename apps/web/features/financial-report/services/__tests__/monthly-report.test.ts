import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMonthlyFinancialReport } from '../monthly-report';

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), expense: vi.fn(), customerReceivable: vi.fn() }));
vi.mock('@pos/db', () => ({ db: { transaction: { findMany: mocks.transaction }, expense: { findMany: mocks.expense }, customerReceivable: { findMany: mocks.customerReceivable } } }));

describe('pembacaan data bulanan', () => {
  beforeEach(() => Object.values(mocks).forEach(mock => mock.mockReset().mockResolvedValue([])));
  it('membatasi seluruh sumber pada toko dan membaca riwayat pembayaran lengkap', async () => {
    await getMonthlyFinancialReport('store-test', 2026, 9, new Date('2026-10-21T00:00:00Z'));
    for (const mock of Object.values(mocks)) expect(mock.mock.calls[0][0].where.storeId).toBe('store-test');
    const query = mocks.transaction.mock.calls[0][0];
    expect(query.where.status).toEqual({ in: ['COMPLETED', 'DP'] });
    expect(query.where.OR).toContainEqual({ invoiceDate: { lt: new Date('2026-09-30T17:00:00Z') } });
    expect(query.select.payments).not.toHaveProperty('where');
    expect(query.select.debtPaymentLogs).not.toHaveProperty('where');
    expect(mocks.expense.mock.calls[0][0].where).toMatchObject({ deletedAt: null, occurredAt: { gte: new Date('2026-08-31T17:00:00Z'), lt: new Date('2026-09-30T17:00:00Z') } });
    expect(mocks.customerReceivable.mock.calls[0][0].select.payments).not.toHaveProperty('where');
  });
  it('menolak laporan parsial ketika sumber gagal', async () => {
    mocks.expense.mockRejectedValue(new Error('database unavailable'));
    await expect(getMonthlyFinancialReport('store-test', 2026, 9)).rejects.toThrow('database unavailable');
  });
});
