import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMonthlyFinancialReport } from '../monthly-report';
vi.mock('@/features/keuangan/repositories/expense-correction-cash-repository', () => ({ loadExpenseCorrectionCash: async () => ({ outflow: [], refunds: [] }) }));
const mocks = vi.hoisted(() => ({ manualIncome: vi.fn(), expense: vi.fn(), transaction: vi.fn(), customerReceivable: vi.fn(), supplierPayable: vi.fn(), backdatedPurchase: vi.fn(), transactionScope: vi.fn() }));
vi.mock('@pos/db', () => {
  const scoped = { transaction: { findMany: mocks.transaction }, customerReceivable: { findMany: mocks.customerReceivable }, supplierPayable: { findMany: mocks.supplierPayable }, expense: { findMany: mocks.expense }, manualIncome: { findMany: mocks.manualIncome }, backdatedPurchase: { findMany: mocks.backdatedPurchase } };
  return { db: { ...scoped, $transaction: mocks.transactionScope } };
});
vi.mock('../monthly-balances', () => ({ getMonthlyBalances: async () => ({ inventoryBalance: null, supplierDebtBalance: 0, supplierDebts: [] }) }));
describe('query pemasukan dan belanja manual bulanan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockResolvedValue([]);
    mocks.customerReceivable.mockResolvedValue([]);
    mocks.backdatedPurchase.mockResolvedValue([]);
    mocks.supplierPayable.mockResolvedValue([]);
    mocks.expense.mockResolvedValue([]);
    mocks.manualIncome.mockResolvedValue([{ id: 'manual-1', description: 'Contoh', category: 'ATK', amount: 100000, occurredAt: new Date('2026-11-02T00:00:00+07:00') }]);
    mocks.transactionScope.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({ transaction: { findMany: mocks.transaction }, customerReceivable: { findMany: mocks.customerReceivable }, supplierPayable: { findMany: mocks.supplierPayable }, expense: { findMany: mocks.expense }, manualIncome: { findMany: mocks.manualIncome }, backdatedPurchase: { findMany: mocks.backdatedPurchase } }));
  });
  it('membatasi toko, periode WIB, dan penghapusan serta membaca metadata transfer', async () => {
    const report = await getMonthlyFinancialReport('store-1', 2026, 11, new Date('2026-12-01'));
    expect(mocks.manualIncome).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: 'store-1', deletedAt: null, occurredAt: { gte: new Date('2026-10-31T17:00:00Z'), lt: new Date('2026-11-30T17:00:00Z') } } }));
    expect(mocks.expense.mock.calls[0][0].select).toMatchObject({ manualPurchasePaymentMethod: true, applicantName: true });
    expect(report.income[0].amounts.ATK).toBe(100000);
  });
  it('membaca kategori dan tanggal koreksi piutang serta kategori transfer', async () => {
    mocks.manualIncome.mockResolvedValue([]);
    mocks.customerReceivable.mockResolvedValue([{ id: 'r1', debtDate: new Date('2026-10-01T00:00:00Z'), dueDate: new Date('2026-11-30T00:00:00Z'), amount: 100, note: null, reportCategory: 'PLAT', customer: { name: 'Contoh' }, payments: [{ id: 'p1', method: 'CASH', amount: 60, createdAt: new Date('2026-11-05T03:00:00Z'), paidAt: new Date('2026-11-02T00:00:00Z') }] }]);
    mocks.expense.mockResolvedValue([{ id: 'e1', occurredAt: new Date('2026-11-02T03:00:00Z'), category: 'SUPPLIES', reportCategory: 'ATK', customCategory: null, amount: 25, changeAmount: 0, description: 'Contoh', applicantName: 'Pemasok', manualPurchasePaymentMethod: 'TRANSFER', shoppingRequest: null, goodsPurchase: null }]);
    const report = await getMonthlyFinancialReport('store-1', 2026, 11, new Date('2026-12-01'));
    expect(mocks.customerReceivable.mock.calls[0][0].select).toMatchObject({ reportCategory: true, payments: { select: { paidAt: true } } });
    expect(mocks.expense.mock.calls[0][0].select).toMatchObject({ reportCategory: true });
    expect(report.income[0]).toMatchObject({ date: '2026-11-02', amounts: { PLAT: 60 } });
    expect(report.purchaseExpenses?.[0]).toMatchObject({ group: 'ATK', amount: 25 });
  });
  it('membaca hutang manual dan alokasi toko yang sama untuk menyusun kas dan kategori', async () => {
    mocks.manualIncome.mockResolvedValue([]);
    mocks.supplierPayable.mockResolvedValue([{ id: 'd1', storeId: 'store-1', supplierName: 'Pemasok', amount: 1000,
      debtDate: new Date('2026-11-01T00:00:00Z'), dueDate: new Date('2026-11-03T00:00:00Z'), reportCategory: 'ATK',
      payments: [{ id: 'p1', amount: 400, paidAt: new Date('2026-11-05T00:00:00Z'), origin: 'MANUAL' }] }]);
    mocks.expense.mockResolvedValue([{ id: 'e1', storeId: 'store-1', occurredAt: new Date('2026-11-05T03:00:00Z'), category: 'SUPPLIES', reportCategory: 'SALARY',
      customCategory: null, amount: 500, changeAmount: 0, description: 'Belanja', applicantName: 'Pemasok', manualPurchasePaymentMethod: 'TRANSFER', shoppingRequest: null, goodsPurchase: null,
      manualTransferAllocations: [{ paymentId: 'p1', payableId: 'd1', amount: 400 }] }]);
    const report = await getMonthlyFinancialReport('store-1', 2026, 11, new Date('2026-12-01T00:00:00Z'));
    expect(mocks.supplierPayable.mock.calls[0][0].where).toMatchObject({ storeId: 'store-1', goodsPurchaseId: null });
    expect(mocks.expense.mock.calls[0][0].select).toHaveProperty('manualTransferAllocations');
    expect(report.expenses).toMatchObject([{ date: '2026-11-03', amount: 600, group: 'ATK' }]);
    expect(report.purchaseExpenses?.map(({ group, amount }) => ({ group, amount }))).toEqual([{ group: 'ATK', amount: 400 }, { group: 'SALARY', amount: 100 }]);
    expect(report.warnings.some(warning => warning.includes('tidak otomatis menjadi pengeluaran'))).toBe(false);
  });
  it('mengganti saldo hutang manual dengan saldo peristiwa pada tanggal akhir laporan', async () => {
    mocks.manualIncome.mockResolvedValue([]);
    mocks.supplierPayable.mockResolvedValue([{ id: 'd1', storeId: 'store-1', supplierName: 'Pemasok', amount: 1000, note: 'Tagihan',
      debtDate: new Date('2026-10-01T00:00:00Z'), dueDate: new Date('2026-10-31T00:00:00Z'), reportCategory: 'ATK',
      payments: [{ id: 'late', amount: 400, paidAt: new Date('2026-11-05T00:00:00Z'), origin: 'MANUAL' }] }]);
    const report = await getMonthlyFinancialReport('store-1', 2026, 10, new Date('2026-12-01T05:00:00Z'));
    expect(report.supplierDebtBalance).toBe(400);
    expect(report.supplierDebts).toMatchObject([{ id: 'd1', amount: 400, note: 'Tagihan' }]);
  });
  it('mengabaikan alokasi transfer mendatang yang ikut terbaca melalui hubungan belanja lama', async () => {
    mocks.manualIncome.mockResolvedValue([]);
    mocks.supplierPayable.mockResolvedValue([{ id: 'd1', storeId: 'store-1', supplierName: 'Pemasok', amount: 100,
      debtDate: new Date('2026-11-01T00:00:00Z'), dueDate: null, note: null, reportCategory: 'ATK',
      payments: [] }]);
    mocks.expense.mockResolvedValue([{ id: 'e1', storeId: 'store-1', occurredAt: new Date('2026-11-05T03:00:00Z'), category: 'SUPPLIES', reportCategory: 'ATK',
      amount: 100, changeAmount: 0, description: 'Transfer', applicantName: 'Pemasok', manualPurchasePaymentMethod: 'TRANSFER', shoppingRequestId: null, goodsPurchaseId: null, shoppingRequest: null, goodsPurchase: null,
      manualTransferAllocations: [{ paymentId: 'p1', payableId: 'd1', amount: 100 }] }]);
    const report = await getMonthlyFinancialReport('store-1', 2026, 11, new Date('2026-11-03T05:00:00Z'));
    expect(report.purchaseExpenses).toEqual([]);
    expect(report.expenses).toEqual([]);
    expect(report.supplierDebtBalance).toBe(100);
    expect(mocks.supplierPayable.mock.calls[0][0].select.payments.where).toEqual({ paidAt: { lte: new Date('2026-11-03T00:00:00Z') } });
  });
  it('menampilkan pembayaran yang tanggal koreksinya masuk periode walau piutang dibuat sesudah periode', async () => {
    mocks.manualIncome.mockResolvedValue([]);
    await getMonthlyFinancialReport('store-1', 2026, 10, new Date('2026-12-01T00:00:00Z'));
    const conditions = mocks.customerReceivable.mock.calls[0][0].where.OR;
    expect(conditions).toContainEqual({ payments: { some: { paidAt: { gte: new Date('2026-10-01T00:00:00Z'), lt: new Date('2026-11-01T00:00:00Z') } } } });
  });
});
