import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMonthlyFinancialReport } from '../monthly-report';
const mocks = vi.hoisted(() => ({ manualIncome: vi.fn(), expense: vi.fn(), transaction: vi.fn(), customerReceivable: vi.fn(), backdatedPurchase: vi.fn(), transactionScope: vi.fn() }));
vi.mock('@pos/db', () => {
  const scoped = { transaction: { findMany: mocks.transaction }, customerReceivable: { findMany: mocks.customerReceivable }, expense: { findMany: mocks.expense }, manualIncome: { findMany: mocks.manualIncome }, backdatedPurchase: { findMany: mocks.backdatedPurchase } };
  return { db: { ...scoped, $transaction: mocks.transactionScope } };
});
vi.mock('../monthly-balances', () => ({ getMonthlyBalances: async () => ({ inventoryBalance: null, supplierDebtBalance: 0, supplierDebts: [] }) }));
describe('query pemasukan dan belanja manual bulanan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockResolvedValue([]);
    mocks.customerReceivable.mockResolvedValue([]);
    mocks.backdatedPurchase.mockResolvedValue([]);
    mocks.expense.mockResolvedValue([]);
    mocks.manualIncome.mockResolvedValue([{ id: 'manual-1', description: 'Contoh', category: 'ATK', amount: 100000, occurredAt: new Date('2026-11-02T00:00:00+07:00') }]);
    mocks.transactionScope.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({ transaction: { findMany: mocks.transaction }, customerReceivable: { findMany: mocks.customerReceivable }, expense: { findMany: mocks.expense }, manualIncome: { findMany: mocks.manualIncome }, backdatedPurchase: { findMany: mocks.backdatedPurchase } }));
  });
  it('membatasi toko, periode WIB, dan penghapusan serta membaca metadata transfer', async () => {
    const report = await getMonthlyFinancialReport('store-1', 2026, 11, new Date('2026-12-01'));
    expect(mocks.manualIncome).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: 'store-1', deletedAt: null, occurredAt: { gte: new Date('2026-10-31T17:00:00Z'), lt: new Date('2026-11-30T17:00:00Z') } } }));
    expect(mocks.expense.mock.calls[0][0].select).toMatchObject({ manualPurchasePaymentMethod: true, applicantName: true });
    expect(report.income[0].amounts.ATK).toBe(100000);
  });
});
