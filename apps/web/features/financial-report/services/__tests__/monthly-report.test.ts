import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMonthlyFinancialReport } from '../monthly-report';

const mocks = vi.hoisted(() => {
  const transaction = vi.fn();
  const expense = vi.fn();
  const customerReceivable = vi.fn();
  const backdatedPurchase = vi.fn();
  return {
    transaction, expense, customerReceivable, backdatedPurchase, balances: vi.fn(), runTransaction: vi.fn(),
    tx: { transaction: { findMany: transaction }, expense: { findMany: expense }, customerReceivable: { findMany: customerReceivable }, backdatedPurchase: { findMany: backdatedPurchase } },
  };
});
vi.mock('@pos/db', () => ({ db: { ...mocks.tx, $transaction: mocks.runTransaction } }));
vi.mock('../monthly-balances', () => ({ getMonthlyBalances: mocks.balances }));

describe('pembacaan data bulanan', () => {
  beforeEach(() => {
    [mocks.transaction, mocks.expense, mocks.customerReceivable, mocks.backdatedPurchase].forEach(mock => mock.mockReset().mockResolvedValue([]));
    mocks.balances.mockReset().mockResolvedValue({ openingInventoryBalance: 100, inventoryBalance: 90, supplierDebts: [], supplierDebtBalance: 0 });
    mocks.runTransaction.mockReset().mockImplementation(callback => callback(mocks.tx));
  });
  it('membaca seluruh sumber pada satu transaksi dengan snapshot yang konsisten', async () => {
    await getMonthlyFinancialReport('store-test', 2026, 9, new Date('2026-10-21T00:00:00Z'));
    expect(mocks.runTransaction).toHaveBeenCalledOnce();
    expect(mocks.runTransaction.mock.calls[0][1]).toMatchObject({ isolationLevel: 'RepeatableRead' });
    expect(mocks.balances.mock.calls[0][3]).toBe(mocks.tx);
  });
  it('membaca nama kategori khusus untuk pengeluaran manual pada sheet RP', async () => {
    mocks.expense.mockResolvedValue([{ id: 'manual-1', occurredAt: new Date('2026-09-02T03:00:00Z'), category: 'OTHER', customCategory: { name: 'Kemasan' }, amount: 100, changeAmount: 20, description: 'Kantong', goodsPurchaseId: null, shoppingRequestId: null, goodsPurchase: null, shoppingRequest: null }]);
    const result = await getMonthlyFinancialReport('store-test', 2026, 9, new Date('2026-10-21T00:00:00Z'));
    expect(mocks.expense.mock.calls[0][0].select.customCategory).toEqual({ select: { name: true } });
    expect(result.expenses[0]).toMatchObject({ categoryName: 'Kemasan', amount: 80 });
  });
  it('membatasi seluruh sumber pada toko dan membaca riwayat pembayaran lengkap', async () => {
    const result = await getMonthlyFinancialReport('store-test', 2026, 9, new Date('2026-10-21T00:00:00Z'));
    for (const mock of [mocks.transaction, mocks.expense, mocks.customerReceivable, mocks.backdatedPurchase]) expect(mock.mock.calls[0][0].where.storeId).toBe('store-test');
    expect(mocks.balances.mock.calls[0][0]).toBe('store-test');
    expect(result).toMatchObject({ openingInventoryBalance: 100, inventoryBalance: 90, supplierDebtBalance: 0 });
    const query = mocks.transaction.mock.calls[0][0];
    expect(query.where.status).toEqual({ in: ['COMPLETED', 'DP'] });
    expect(query.where.OR).toContainEqual({ invoiceDate: { lt: new Date('2026-09-30T17:00:00Z') } });
    expect(query.select.payments).not.toHaveProperty('where');
    expect(query.select.debtPaymentLogs).not.toHaveProperty('where');
    const expenseQuery = mocks.expense.mock.calls[0][0];
    expect(expenseQuery.where.deletedAt).toBeNull();
    expect(expenseQuery.where.OR).toContainEqual({ occurredAt: { gte: new Date('2026-08-31T17:00:00Z'), lt: new Date('2026-09-30T17:00:00Z') } });
    expect(expenseQuery.where.OR).toContainEqual({ occurredAt: { lt: new Date('2026-09-30T17:00:00Z') }, OR: [{ goodsPurchaseId: { not: null } }, { shoppingRequestId: { not: null } }] });
    expect(expenseQuery.where.OR).toContainEqual({ occurredAt: { lte: new Date('2026-10-21T00:00:00Z') }, goodsPurchase: { is: { paymentMethod: 'GIRO', paymentDueDate: { gte: new Date('2026-09-01T00:00:00Z'), lt: new Date('2026-10-01T00:00:00Z') } } } });
    expect(expenseQuery.where.OR).toContainEqual({ occurredAt: { lte: new Date('2026-10-21T00:00:00Z') }, shoppingRequest: { is: { goodsPurchases: { some: { storeId: 'store-test', status: 'APPROVED', paymentMethod: 'GIRO', paymentDueDate: { gte: new Date('2026-09-01T00:00:00Z'), lt: new Date('2026-10-01T00:00:00Z') } } } } } });
    expect(expenseQuery.where.OR).toContainEqual({ occurredAt: { lte: new Date('2026-10-21T00:00:00Z') }, goodsPurchase: { is: { supplierPayable: { is: { storeId: 'store-test', debtDate: { lte: new Date('2026-09-30T00:00:00Z') } } } } } });
    expect(expenseQuery.select.goodsPurchase.select.supplierPayable.select.payments).not.toHaveProperty('where');
    expect(mocks.customerReceivable.mock.calls[0][0].select.payments).not.toHaveProperty('where');
  });
  it('menolak laporan parsial ketika sumber gagal', async () => {
    mocks.expense.mockRejectedValue(new Error('database unavailable'));
    await expect(getMonthlyFinancialReport('store-test', 2026, 9)).rejects.toThrow('database unavailable');
  });
  it('menjelaskan riwayat inventaris yang belum tersedia tanpa meminta perbaikan satuan dasar', async () => {
    mocks.balances.mockResolvedValue({ openingInventoryBalance: null, inventoryBalance: null, supplierDebts: [], supplierDebtBalance: 0 });
    const result = await getMonthlyFinancialReport('store-test', 2026, 9, new Date('2026-10-21T00:00:00Z'));
    const guidance = result.warnings.join(' ');
    expect(guidance).toContain('riwayat');
    expect(guidance).toContain('belum tersedia dari riwayat');
    expect(guidance).not.toContain('Periksa satuan dasar');
  });
  it('tidak menyajikan total hutang sebagai angka lengkap saat riwayat giro belum diketahui', async () => {
    mocks.expense.mockResolvedValue([{ id: 'giro-1', goodsPurchaseId: 'p1', shoppingRequestId: 's1', occurredAt: new Date('2026-08-01T03:00:00Z'), category: 'SUPPLIES', amount: 100, changeAmount: 0, description: 'Bahan', shoppingRequest: { status: 'APPROVED' }, goodsPurchase: { storeId: 'store-test', totalAmount: 100, number: 'PB-1', status: 'APPROVED', paymentMethod: 'GIRO', paymentDueDate: new Date('2026-09-30T00:00:00Z'), supplierNameSnapshot: 'Pemasok', supplierPayable: null } }]);
    mocks.balances.mockResolvedValue({ openingInventoryBalance: 100, inventoryBalance: 90, supplierDebts: [{ id: 'manual', date: '2026-09-01', dueDate: null, supplier: 'Lain', note: null, amount: 20 }], supplierDebtBalance: 20 });
    const result = await getMonthlyFinancialReport('store-test', 2026, 9, new Date('2026-10-21T00:00:00Z'));
    expect(result.supplierDebtBalance).toBeNull();
    expect(result.supplierDebts).toEqual([expect.objectContaining({ id: 'manual', amount: 20 })]);
    expect(result.cashIncomplete).toBe(true);
    expect(result.warnings.join(' ')).toContain('riwayat giro');
  });
  it('menghitung pembayaran giro tertaut dan mempertahankan saldo hutang yang diketahui', async () => {
    mocks.expense.mockResolvedValue([{ id: 'giro-1', goodsPurchaseId: 'p1', shoppingRequestId: 's1', occurredAt: new Date('2026-08-01T03:00:00Z'), category: 'SUPPLIES', amount: 100, changeAmount: 0, description: 'Bahan', shoppingRequest: { status: 'APPROVED' }, goodsPurchase: { storeId: 'store-test', totalAmount: 100, number: 'PB-1', status: 'APPROVED', paymentMethod: 'GIRO', paymentDueDate: new Date('2026-09-30T00:00:00Z'), supplierNameSnapshot: 'Pemasok', supplierPayable: { id: 'debt-1', storeId: 'store-test', giroHistoryVerifiedAt: new Date('2026-08-01T03:00:00Z'), payments: [{ id: 'pay-1', amount: 30, paidAt: new Date('2026-09-10T00:00:00Z') }] } } }]);
    mocks.balances.mockResolvedValue({ openingInventoryBalance: 100, inventoryBalance: 90, supplierDebts: [{ id: 'debt-1', date: '2026-08-01', dueDate: '2026-09-30', supplier: 'Pemasok', note: null, amount: 70 }], supplierDebtBalance: 70 });
    const result = await getMonthlyFinancialReport('store-test', 2026, 9, new Date('2026-10-21T00:00:00Z'));
    expect(result.supplierDebtBalance).toBe(70);
    expect(result.purchaseExpenses).toEqual([expect.objectContaining({ amount: 100 })]);
    expect(result.giroPayments).toEqual([expect.objectContaining({ amount: 30, date: '2026-09-10' })]);
    expect(result.supplierDebts).toHaveLength(1);
  });
  it('menghubungkan expense belanja lama ke satu pembelian disetujui yang tidak ambigu', async () => {
    const purchase = { id: 'p1', storeId: 'store-test', number: 'PB-1', status: 'APPROVED', totalAmount: 100, paymentMethod: 'GIRO', paymentDueDate: new Date('2026-09-30T00:00:00Z'), supplierNameSnapshot: 'Pemasok', supplierPayable: { id: 'debt-1', storeId: 'store-test', giroHistoryVerifiedAt: new Date('2026-08-01T03:00:00Z'), payments: [{ id: 'pay-1', amount: 30, paidAt: new Date('2026-09-10T00:00:00Z') }] } };
    mocks.expense.mockResolvedValue([{ id: 'old', goodsPurchaseId: null, shoppingRequestId: 's1', occurredAt: new Date('2026-08-01T03:00:00Z'), category: 'SUPPLIES', amount: 100, changeAmount: 0, description: 'Bahan', shoppingRequest: { status: 'APPROVED', number: 'DB-1', goodsPurchases: [purchase] }, goodsPurchase: null }]);
    const result = await getMonthlyFinancialReport('store-test', 2026, 9, new Date('2026-10-21T00:00:00Z'));
    expect(result.purchaseExpenses).toEqual([expect.objectContaining({ amount: 100, purchase: expect.objectContaining({ reference: 'PB-1', method: 'GIRO' }) })]);
    expect(result.giroPayments).toEqual([expect.objectContaining({ amount: 30 })]);
    expect(result.cashIncomplete).toBe(false);
  });
  it('membiarkan expense lama ambigu sebagai belum diketahui', async () => {
    const purchase = { id: 'p1', storeId: 'store-test', number: 'PB-1', status: 'APPROVED', paymentMethod: 'GIRO', paymentDueDate: new Date('2026-09-30T00:00:00Z'), supplierNameSnapshot: 'Pemasok', supplierPayable: null };
    mocks.expense.mockResolvedValue([{ id: 'old', goodsPurchaseId: null, shoppingRequestId: 's1', occurredAt: new Date('2026-09-01T03:00:00Z'), category: 'SUPPLIES', amount: 100, changeAmount: 0, description: 'Bahan', shoppingRequest: { status: 'APPROVED', number: 'DB-1', goodsPurchases: [purchase, { ...purchase, id: 'p2' }] }, goodsPurchase: null }]);
    const result = await getMonthlyFinancialReport('store-test', 2026, 9, new Date('2026-10-21T00:00:00Z'));
    expect(result.purchaseExpenses).toEqual([expect.objectContaining({ purchase: expect.objectContaining({ reference: 'DB-1', method: null }) })]);
    expect(result.cashIncomplete).toBe(true);
    expect(result.supplierDebtBalance).toBeNull();
  });
  it('memberi peringatan jadwal legacy ambigu pada bulan jatuh tempo, tanpa menciptakan saldo sebelum kewajiban', async () => {
    const purchase = { id: 'p1', storeId: 'store-test', number: 'PB-1', status: 'APPROVED', totalAmount: 100, paymentMethod: 'GIRO', paymentDueDate: new Date('2026-09-30T00:00:00Z'), supplierNameSnapshot: 'Pemasok', supplierPayable: null };
    mocks.expense.mockResolvedValue([{ id: 'old', goodsPurchaseId: null, shoppingRequestId: 's1', occurredAt: new Date('2026-10-01T03:00:00Z'), category: 'SUPPLIES', amount: 100, changeAmount: 0, description: 'Bahan', shoppingRequest: { status: 'APPROVED', number: 'DB-1', goodsPurchases: [purchase, { ...purchase, id: 'p2' }] }, goodsPurchase: null }]);
    const result = await getMonthlyFinancialReport('store-test', 2026, 9, new Date('2026-10-21T00:00:00Z'));
    expect(result.warnings.join(' ')).toContain('jadwal belanja lama');
    expect(result.purchaseExpenses).toEqual([]);
    expect(result.cashIncomplete).toBe(false);
    expect(result.supplierDebtBalance).toBe(0);
  });
  it('tidak memasangkan expense lama jika total pembelian tidak sesuai', async () => {
    const purchase = { id: 'p1', storeId: 'store-test', number: 'PB-1', status: 'APPROVED', totalAmount: 120, paymentMethod: 'GIRO', paymentDueDate: new Date('2026-09-30T00:00:00Z'), supplierNameSnapshot: 'Pemasok', supplierPayable: null };
    mocks.expense.mockResolvedValue([{ id: 'old', goodsPurchaseId: null, shoppingRequestId: 's1', occurredAt: new Date('2026-09-01T03:00:00Z'), category: 'SUPPLIES', amount: 100, changeAmount: 0, description: 'Bahan', shoppingRequest: { status: 'APPROVED', number: 'DB-1', goodsPurchases: [purchase] }, goodsPurchase: null }]);
    const result = await getMonthlyFinancialReport('store-test', 2026, 9, new Date('2026-10-21T00:00:00Z'));
    expect(result.purchaseExpenses).toEqual([expect.objectContaining({ purchase: expect.objectContaining({ reference: 'DB-1', method: null }) })]);
    expect(result.supplierDebtBalance).toBeNull();
  });
  it('menandai hubungan giro eksplisit yang nominalnya berbeda sebagai belum diketahui', async () => {
    mocks.expense.mockResolvedValue([{ id: 'old', goodsPurchaseId: 'p1', shoppingRequestId: 's1', occurredAt: new Date('2026-09-01T03:00:00Z'), category: 'SUPPLIES', amount: 100, changeAmount: 0, description: 'Bahan', shoppingRequest: { status: 'APPROVED', number: 'DB-1', goodsPurchases: [] }, goodsPurchase: { id: 'p1', storeId: 'store-test', number: 'PB-1', status: 'APPROVED', totalAmount: 120, paymentMethod: 'GIRO', paymentDueDate: new Date('2026-09-30T00:00:00Z'), supplierNameSnapshot: 'Pemasok', supplierPayable: { id: 'debt-1', storeId: 'store-test', giroHistoryVerifiedAt: new Date('2026-09-01T03:00:00Z'), payments: [] } } }]);
    const result = await getMonthlyFinancialReport('store-test', 2026, 9, new Date('2026-10-21T00:00:00Z'));
    expect(result.cashIncomplete).toBe(true);
    expect(result.supplierDebtBalance).toBeNull();
    expect(result.warnings.join(' ')).toContain('nominal');
    expect(result.purchaseExpenses).toEqual([expect.objectContaining({ amount: 120, date: '2026-09-30', purchase: expect.objectContaining({ reference: 'PB-1', method: 'GIRO' }) })]);
  });
  it('memakai total pembelian saat jadwal giro tanpa jatuh tempo berbeda dari pengeluaran', async () => {
    mocks.expense.mockResolvedValue([{ id: 'old', goodsPurchaseId: 'p1', shoppingRequestId: 's1', occurredAt: new Date('2026-09-01T03:00:00Z'), category: 'SUPPLIES', amount: 100, changeAmount: 0, description: 'Bahan', shoppingRequest: { status: 'APPROVED', number: 'DB-1', goodsPurchases: [] }, goodsPurchase: { id: 'p1', storeId: 'store-test', number: 'PB-1', status: 'APPROVED', totalAmount: 120, paymentMethod: 'GIRO', paymentDueDate: null, supplierNameSnapshot: 'Pemasok', supplierPayable: { id: 'debt-1', storeId: 'store-test', giroHistoryVerifiedAt: new Date('2026-09-01T03:00:00Z'), payments: [] } } }]);
    const result = await getMonthlyFinancialReport('store-test', 2026, 9, new Date('2026-10-21T00:00:00Z'));
    expect(result.purchaseExpenses).toEqual([expect.objectContaining({ amount: 120, date: '2026-09-01', purchase: expect.objectContaining({ reference: 'PB-1', method: 'GIRO', dueDate: null }) })]);
    expect(result.warnings.join(' ')).toContain('Jatuh tempo giro PB-1 belum tersedia.');
    expect(result.cashIncomplete).toBe(true);
    expect(result.supplierDebtBalance).toBeNull();
  });
  it('memperingatkan nominal jadwal berbeda walau jatuh tempo sebelum kewajiban', async () => {
    mocks.expense.mockResolvedValue([{ id: 'old', goodsPurchaseId: 'p1', shoppingRequestId: 's1', occurredAt: new Date('2026-10-01T03:00:00Z'), category: 'SUPPLIES', amount: 100, changeAmount: 0, description: 'Bahan', shoppingRequest: { status: 'APPROVED', number: 'DB-1', goodsPurchases: [] }, goodsPurchase: { id: 'p1', storeId: 'store-test', number: 'PB-1', status: 'APPROVED', totalAmount: 120, paymentMethod: 'GIRO', paymentDueDate: new Date('2026-09-30T00:00:00Z'), supplierNameSnapshot: 'Pemasok', supplierPayable: null } }]);
    const result = await getMonthlyFinancialReport('store-test', 2026, 9, new Date('2026-10-21T00:00:00Z'));
    expect(result.purchaseExpenses).toEqual([expect.objectContaining({ amount: 120, date: '2026-09-30' })]);
    expect(result.warnings).toContain('Sebagian nominal belanja tidak cocok dengan pembelian; periksa jadwal belanja.');
    expect(result.cashIncomplete).toBe(false);
    expect(result.supplierDebtBalance).toBe(0);
  });
});
