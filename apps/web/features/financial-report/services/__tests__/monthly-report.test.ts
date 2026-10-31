import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMonthlyFinancialReport } from '../monthly-report';

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), expense: vi.fn(), customerReceivable: vi.fn(), balances: vi.fn() }));
vi.mock('@pos/db', () => ({ db: { transaction: { findMany: mocks.transaction }, expense: { findMany: mocks.expense }, customerReceivable: { findMany: mocks.customerReceivable } } }));
vi.mock('../monthly-balances', () => ({ getMonthlyBalances: mocks.balances }));

describe('pembacaan data bulanan', () => {
  beforeEach(() => {
    [mocks.transaction, mocks.expense, mocks.customerReceivable].forEach(mock => mock.mockReset().mockResolvedValue([]));
    mocks.balances.mockReset().mockResolvedValue({ openingInventoryBalance: 100, inventoryBalance: 90, supplierDebts: [], supplierDebtBalance: 0 });
  });
  it('membatasi seluruh sumber pada toko dan membaca riwayat pembayaran lengkap', async () => {
    const result = await getMonthlyFinancialReport('store-test', 2026, 9, new Date('2026-10-21T00:00:00Z'));
    for (const mock of [mocks.transaction, mocks.expense, mocks.customerReceivable]) expect(mock.mock.calls[0][0].where.storeId).toBe('store-test');
    expect(mocks.balances.mock.calls[0][0]).toBe('store-test');
    expect(result).toMatchObject({ openingInventoryBalance: 100, inventoryBalance: 90, supplierDebtBalance: 0 });
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
