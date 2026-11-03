import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const transactions = vi.fn();
  const expenses = vi.fn();
  const receivables = vi.fn();
  const backdated = vi.fn();
  const manualIncome = vi.fn();
  const balances = vi.fn();
  const tx = { transaction: { findMany: transactions }, expense: { findMany: expenses }, customerReceivable: { findMany: receivables }, backdatedPurchase: { findMany: backdated }, manualIncome: { findMany: manualIncome } };
  return { transactions, expenses, receivables, backdated, manualIncome, balances, tx, run: vi.fn() };
});
vi.mock('@pos/db', () => ({ db: { $transaction: mocks.run } }));
vi.mock('../monthly-balances', () => ({ getMonthlyBalances: mocks.balances }));
import { getMonthlyFinancialReport } from '../monthly-report';

describe('pembacaan ledger belanja terdahulu', () => {
  beforeEach(() => {
    [mocks.transactions, mocks.expenses, mocks.receivables, mocks.backdated, mocks.manualIncome].forEach(mock => mock.mockReset().mockResolvedValue([]));
    mocks.balances.mockReset().mockResolvedValue({ openingInventoryBalance: 100, inventoryBalance: 90, supplierDebts: [{ id: 'manual', date: '2026-10-01', dueDate: null, supplier: 'Pemasok', note: null, amount: 5 }], supplierDebtBalance: 5 });
    mocks.run.mockReset().mockImplementation(callback => callback(mocks.tx));
  });

  it('membaca ledger toko dalam snapshot yang sama dan menggabungkan hanya sisa sampai akhir periode', async () => {
    const rows = [
      { id: 'b1', storeId: 'store-1', purchaseDate: new Date('2026-10-05T00:00:00Z'), dueDate: new Date('2026-11-20T00:00:00Z'), reference: 'G-1', paymentMethod: 'GIRO', amount: 100,
        payments: [{ id: 'p1', paidAt: new Date('2026-10-31T00:00:00Z'), amount: 30 }, { id: 'p2', paidAt: new Date('2026-11-01T00:00:00Z'), amount: 20 }, { id: 'p3', paidAt: new Date('2026-12-01T00:00:00Z'), amount: 50 }] },
      { id: 'other', storeId: 'store-2', purchaseDate: new Date('2026-10-05T00:00:00Z'), dueDate: new Date('2026-11-20T00:00:00Z'), reference: 'OTHER', paymentMethod: 'GIRO', amount: 1000, payments: [] },
    ];
    mocks.backdated.mockImplementation(async ({ where }) => rows.filter(row => row.storeId === where.storeId && row.purchaseDate <= where.purchaseDate.lte));
    mocks.expenses.mockResolvedValue([{ id: 'derived', occurredAt: new Date('2026-11-01T03:00:00Z'), category: 'SUPPLIES', amount: 20, changeAmount: 0, description: 'Otomatis', backdatedPurchasePaymentId: 'p2', goodsPurchaseId: null, shoppingRequestId: null, goodsPurchase: null, shoppingRequest: null }]);
    const result = await getMonthlyFinancialReport('store-1', 2026, 11, new Date('2027-01-01T00:00:00Z'));

    expect(mocks.run.mock.calls[0][1]).toEqual({ isolationLevel: 'RepeatableRead', timeout: 30_000 });
    expect(mocks.backdated).toHaveBeenCalledOnce();
    const query = mocks.backdated.mock.calls[0][0];
    expect(query.where).toMatchObject({ storeId: 'store-1', purchaseDate: { lte: new Date('2026-11-30T00:00:00Z') } });
    expect(query.select.payments.select).toMatchObject({ id: true, amount: true, paidAt: true });
    const expenseWhere = mocks.expenses.mock.calls[0][0].where;
    expect(expenseWhere).toMatchObject({ backdatedPurchaseDueId: null, backdatedPurchasePaymentId: null });
    expect(expenseWhere.AND).toContainEqual({ OR: [{ backdatedPurchaseDueId: null }, { occurredAt: { lt: new Date('2027-01-01T17:00:00Z') } }] });
    expect(result.expenses).toEqual([]);
    expect(result.purchaseExpenses).toEqual([expect.objectContaining({ amount: 100 })]);
    expect(result.giroPayments).toEqual([expect.objectContaining({ amount: 20 })]);
    expect(result.supplierDebtBalance).toBe(55);
    expect(result.supplierDebts).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'manual', amount: 5 }), expect.objectContaining({ amount: 50 })]));
    expect(result.supplierDebts).toHaveLength(2);
    expect(mocks.balances.mock.calls[0][3]).toBe(mocks.tx);
  });
});
