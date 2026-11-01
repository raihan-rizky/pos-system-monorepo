import { describe, expect, it } from 'vitest';
import { buildMonthlyPeriod, buildMonthlyReport } from '../monthly-report-core';

const utcDate = (date: string) => new Date(`${date}T00:00:00.000Z`);
const giro = (overrides: Record<string, unknown> = {}) => ({
  id: 'expense-giro', goodsPurchaseId: 'purchase-1', shoppingRequestId: 'shopping-1',
  occurredAt: new Date('2026-10-01T03:00:00Z'), category: 'SUPPLIES', amount: 100000,
  changeAmount: 0, description: 'Bahan', shoppingRequest: { status: 'APPROVED', number: 'DB-1' },
  goodsPurchase: {
    number: 'PB-1', status: 'APPROVED', paymentMethod: 'GIRO',
    paymentDueDate: utcDate('2026-11-20'), supplierNameSnapshot: 'Pemasok',
    supplierPayable: { id: 'debt-1', giroHistoryVerifiedAt: new Date('2026-10-01T03:00:00Z'),
      payments: [{ id: 'pay-1', amount: 30000, paidAt: utcDate('2026-11-01') },
        { id: 'pay-2', amount: 70000, paidAt: utcDate('2026-12-10') }] },
  },
  ...overrides,
});
const report = (year: number, month: number, expenses: ReturnType<typeof giro>[], now = new Date('2027-01-01T00:00:00Z')) =>
  buildMonthlyReport({ year, month, period: buildMonthlyPeriod(year, month, now), transactions: [], expenses, manualReceivables: [] });

describe('sumber belanja dan pembayaran giro bulanan', () => {
  it('menjadwalkan giro pada jatuh tempo dan menghitung pembayaran pada tanggal sebenarnya', () => {
    const october = report(2026, 10, [giro()]);
    const november = report(2026, 11, [giro()]);
    const december = report(2026, 12, [giro()]);
    expect(october.expenses).toEqual([]);
    expect(october.purchaseExpenses).toEqual([]);
    expect(october.giroPayments).toEqual([]);
    expect(november.purchaseExpenses).toEqual([expect.objectContaining({ date: '2026-11-20', amount: 100000, purchase: expect.objectContaining({ method: 'GIRO', reference: 'PB-1' }) })]);
    expect(november.giroPayments).toEqual([expect.objectContaining({ date: '2026-11-01', amount: 30000, reference: 'PB-1', group: 'OTHER' })]);
    expect(december.purchaseExpenses).toEqual([]);
    expect(december.giroPayments).toEqual([expect.objectContaining({ date: '2026-12-10', amount: 70000 })]);
    expect(november.cashIncomplete).toBe(false);
  });

  it('memuat pengeluaran manual saja pada RP, termasuk yang terhubung transaksi', () => {
    const manual = giro({ id: 'manual', goodsPurchaseId: null, shoppingRequestId: null, goodsPurchase: null, shoppingRequest: null, transactionId: 'sale-1' });
    const transfer = giro({ id: 'transfer', goodsPurchaseId: 'purchase-2', goodsPurchase: { ...giro().goodsPurchase, number: 'PB-2', paymentMethod: 'TRANSFER', paymentDueDate: null, supplierPayable: null } });
    const result = report(2026, 10, [manual, transfer, giro()]);
    expect(result.expenses.map(row => row.id)).toEqual(['manual']);
    expect(result.purchaseExpenses).toEqual([expect.objectContaining({ id: 'transfer', date: '2026-10-01', purchase: expect.objectContaining({ method: 'TRANSFER' }) })]);
    expect(result.giroPayments).toEqual([]);
  });

  it('tetap menampilkan jadwal jatuh tempo bulan berjalan setelah hari ini', () => {
    const result = report(2026, 11, [giro()], new Date('2026-11-02T02:00:00Z'));
    expect(result.to).toBe('2026-11-02');
    expect(result.purchaseExpenses).toEqual([expect.objectContaining({ date: '2026-11-20' })]);
    expect(result.giroPayments).toEqual([expect.objectContaining({ date: '2026-11-01', amount: 30000 })]);
  });

  it('memasukkan pembayaran sebelum jatuh tempo pada bulan pembayarannya', () => {
    const expense = giro();
    expense.goodsPurchase.supplierPayable.payments.unshift({ id: 'early', amount: 10000, paidAt: utcDate('2026-10-20') });
    expect(report(2026, 10, [expense]).giroPayments).toEqual([expect.objectContaining({ date: '2026-10-20', amount: 10000 })]);
  });

  it('menandai giro lama belum diperiksa sebagai kas dan hutang belum lengkap', () => {
    const expense = giro({ goodsPurchase: { ...giro().goodsPurchase, supplierPayable: null } });
    const result = report(2026, 11, [expense]);
    expect(result.purchaseExpenses).toEqual([expect.objectContaining({ amount: 100000 })]);
    expect(result.giroPayments).toEqual([]);
    expect(result.cashIncomplete).toBe(true);
    expect(result.supplierDebtIncomplete).toBe(true);
    expect(result.warnings.join(' ')).toContain('riwayat giro');
  });

  it('menghitung kembali periode setelah riwayat lama diverifikasi lunas', () => {
    const original = giro();
    const verified = giro({ goodsPurchase: { ...original.goodsPurchase, supplierPayable: { ...original.goodsPurchase.supplierPayable, payments: [{ id: 'paid', amount: 100000, paidAt: utcDate('2026-10-20') }] } } });
    const result = report(2026, 11, [verified]);
    expect(result.cashIncomplete).toBe(false);
    expect(result.supplierDebtIncomplete).toBe(false);
    expect(result.giroPayments).toEqual([]);
    expect(result.purchaseExpenses).toEqual([expect.objectContaining({ amount: 100000 })]);
  });

  it('mengabaikan pembayaran duplikat yang memiliki ID sama', () => {
    const expense = giro();
    expense.goodsPurchase.supplierPayable.payments.push(expense.goodsPurchase.supplierPayable.payments[0]);
    expect(report(2026, 11, [expense, expense]).giroPayments).toEqual([expect.objectContaining({ id: 'pay-1', amount: 30000 })]);
    expect(report(2026, 11, [expense, expense]).purchaseExpenses).toHaveLength(1);
  });

  it('tidak menganggap belanja lama tanpa metode sebagai transfer atau giro', () => {
    const expense = giro({ goodsPurchaseId: null, goodsPurchase: null });
    const result = report(2026, 10, [expense]);
    expect(result.expenses).toEqual([]);
    expect(result.purchaseExpenses).toEqual([expect.objectContaining({ purchase: expect.objectContaining({ method: null }) })]);
    expect(result.cashIncomplete).toBe(true);
    expect(result.supplierDebtIncomplete).toBe(true);
  });

  it('tidak membuat kas dan hutang tidak lengkap sebelum belanja legacy terjadi', () => {
    const expense = giro({ goodsPurchaseId: null, goodsPurchase: null });
    const result = report(2026, 9, [expense]);
    expect(result.cashIncomplete).toBe(false);
    expect(result.supplierDebtIncomplete).toBe(false);
  });

  it('menghormati batas WIB untuk transaksi transfer dan tanggal kalender pembayaran', () => {
    const transfer = giro({ id: 'transfer', occurredAt: new Date('2026-10-31T17:00:00Z'), goodsPurchase: { ...giro().goodsPurchase, paymentMethod: 'TRANSFER', paymentDueDate: null, supplierPayable: null } });
    const november = report(2026, 11, [transfer, giro()]);
    expect(november.purchaseExpenses?.map(row => [row.id, row.date])).toEqual([['transfer', '2026-11-01'], ['expense-giro', '2026-11-20']]);
    expect(november.giroPayments?.[0].date).toBe('2026-11-01');
    expect(report(2026, 10, [transfer]).purchaseExpenses).toEqual([]);
  });

  it('menampilkan giro yang jatuh tempo sebelum tanggal penerimaan tanpa menambahkan kas atau hutang sebelumnya', () => {
    const lateReceipt = giro({ occurredAt: new Date('2026-11-01T03:00:00Z'), goodsPurchase: { ...giro().goodsPurchase, paymentDueDate: utcDate('2026-10-31'), supplierPayable: null } });
    const result = report(2026, 10, [lateReceipt]);
    expect(result.purchaseExpenses).toEqual([expect.objectContaining({ date: '2026-10-31', amount: 100000 })]);
    expect(result.giroPayments).toEqual([]);
    expect(result.cashIncomplete).toBe(false);
    expect(result.supplierDebtIncomplete).toBe(false);
  });

  it('memakai tanggal hutang manual terverifikasi untuk pembayaran sebelum penerimaan', () => {
    const original = giro();
    const lateReceipt = giro({ occurredAt: new Date('2026-11-01T03:00:00Z'), goodsPurchase: { ...original.goodsPurchase, paymentDueDate: utcDate('2026-10-31'), supplierPayable: { ...original.goodsPurchase.supplierPayable, debtDate: utcDate('2026-10-05'), payments: [{ id: 'early', amount: 30000, paidAt: utcDate('2026-10-10') }] } } });
    const result = report(2026, 10, [lateReceipt]);
    expect(result.purchaseExpenses).toEqual([expect.objectContaining({ date: '2026-10-31', amount: 100000 })]);
    expect(result.giroPayments).toEqual([expect.objectContaining({ date: '2026-10-10', amount: 30000 })]);
    expect(result.cashIncomplete).toBe(false);
  });
});
