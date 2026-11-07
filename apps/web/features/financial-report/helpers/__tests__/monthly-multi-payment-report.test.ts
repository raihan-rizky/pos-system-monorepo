import { describe, expect, it } from 'vitest';
import { buildMonthlyPeriod, buildMonthlyReport, type MonthlyExpenseInput } from '../monthly-report-core';

const date = (value: string) => new Date(`${value}T00:00:00Z`);
type Purchase = NonNullable<MonthlyExpenseInput['goodsPurchase']>;
const schedule: NonNullable<Purchase['payments']> = [
  { id: 'giro-nov', method: 'GIRO', amount: 40000, dueDate: date('2026-11-20') },
  { id: 'giro-dec', method: 'GIRO', amount: 60000, dueDate: date('2026-12-15') },
];
const expense = (payments = schedule): MonthlyExpenseInput & { goodsPurchase: Purchase } => ({
  id: 'expense-1', goodsPurchaseId: 'purchase-1', occurredAt: new Date('2026-10-01T03:00:00Z'),
  category: 'SUPPLIES', amount: 100000, changeAmount: 0, description: 'Bahan',
  goodsPurchase: {
    number: 'PB-1', status: 'APPROVED', totalAmount: 100000,
    paymentMethod: null, paymentDueDate: null, supplierNameSnapshot: 'Pemasok', payments,
    supplierPayable: { id: 'debt-1', debtDate: date('2026-10-01'), giroHistoryVerifiedAt: date('2026-10-01'),
      payments: [{ id: 'actual-1', amount: 50000, paidAt: date('2026-11-10') }, { id: 'actual-2', amount: 50000, paidAt: date('2026-12-10') }] },
  },
});
const report = (month: number, row: MonthlyExpenseInput) => buildMonthlyReport({
  year: 2026, month, period: buildMonthlyPeriod(2026, month, date('2027-01-01')),
  transactions: [], expenses: [row], manualReceivables: [],
});

describe('jadwal multi pembayaran belanja bulanan', () => {
  it('menempatkan setiap giro pada bulan jatuh temponya tanpa menggandakan pembayaran aktual', () => {
    const november = report(11, expense());
    const december = report(12, expense());
    expect(report(10, expense()).purchaseExpenses).toEqual([]);
    expect(november.purchaseExpenses).toEqual([expect.objectContaining({ amount: 40000, date: '2026-11-20', purchase: expect.objectContaining({ method: 'GIRO', dueDate: '2026-11-20' }) })]);
    expect(december.purchaseExpenses).toEqual([expect.objectContaining({ amount: 60000, date: '2026-12-15' })]);
    expect(november.giroPayments).toEqual([expect.objectContaining({ id: 'actual-1', amount: 50000 })]);
    expect(december.giroPayments).toEqual([expect.objectContaining({ id: 'actual-2', amount: 50000 })]);
    expect(november.cashIncomplete).toBe(false);
  });

  it('menggabungkan transfer saat penerimaan dan menjadwalkan subtotal giro saja', () => {
    const row = expense([
      { id: 't1', method: 'TRANSFER', amount: 10000, dueDate: null },
      { id: 't2', method: 'TRANSFER', amount: 20000, dueDate: null },
      { id: 'g1', method: 'GIRO', amount: 70000, dueDate: date('2026-11-20') },
    ]);
    row.goodsPurchase.supplierPayable!.payments = [{ id: 'partial', amount: 20000, paidAt: date('2026-11-10') }];
    expect(report(10, row).purchaseExpenses).toEqual([expect.objectContaining({ amount: 30000, date: '2026-10-01', purchase: expect.objectContaining({ method: 'TRANSFER', dueDate: null }) })]);
    expect(report(11, row).purchaseExpenses).toEqual([expect.objectContaining({ amount: 70000, date: '2026-11-20' })]);
    expect(report(11, row).giroPayments).toEqual([expect.objectContaining({ id: 'partial', amount: 20000 })]);
    expect(report(10, row).cashIncomplete).toBe(false);
  });

  it('memperlakukan jadwal transfer saja sebagai kas lengkap tanpa hutang giro', () => {
    const row = expense([{ id: 't1', method: 'TRANSFER', amount: 100000, dueDate: null }]);
    row.goodsPurchase.supplierPayable = null;
    const result = report(10, row);
    expect(result.purchaseExpenses).toEqual([expect.objectContaining({ amount: 100000, purchase: expect.objectContaining({ method: 'TRANSFER' }) })]);
    expect(result.giroPayments).toEqual([]);
    expect(result.cashIncomplete).toBe(false);
    expect(result.supplierDebtIncomplete).toBe(false);
  });

  it('memakai satu giro legacy hanya ketika tidak ada jadwal anak', () => {
    const row = expense([]);
    row.goodsPurchase.paymentMethod = 'GIRO';
    row.goodsPurchase.paymentDueDate = date('2026-11-20');
    expect(report(11, row).purchaseExpenses).toEqual([expect.objectContaining({ amount: 100000, date: '2026-11-20' })]);
    const unknown = expense([]);
    expect(report(10, unknown).cashIncomplete).toBe(true);
    expect(report(10, unknown).purchaseExpenses?.[0].purchase?.method).toBeNull();
  });

  it('tetap menampilkan dua giro dalam bulan yang sama dengan ID berbeda', () => {
    const row = expense([schedule[0], { ...schedule[1], dueDate: date('2026-11-25') }]);
    const result = report(11, row);
    expect(result.purchaseExpenses?.map(row => row.amount)).toEqual([40000, 60000]);
    expect(new Set(result.purchaseExpenses?.map(row => row.id)).size).toBe(2);
    expect(result.giroPayments).toHaveLength(1);
  });

  it('menampilkan giro sebelum penerimaan tanpa membuat kas atau hutang sebelumnya', () => {
    const row = expense([{ id: 'g1', method: 'GIRO', amount: 100000, dueDate: date('2026-09-30') }]);
    row.goodsPurchase.supplierPayable = null;
    const result = report(9, row);
    expect(result.purchaseExpenses).toEqual([expect.objectContaining({ amount: 100000, date: '2026-09-30' })]);
    expect(result.giroPayments).toEqual([]);
    expect(result.cashIncomplete).toBe(false);
    expect(result.supplierDebtIncomplete).toBe(false);
  });

  it('menandai riwayat giro anak yang belum diperiksa tanpa menganggap transfer tidak diketahui', () => {
    const row = expense();
    row.goodsPurchase.supplierPayable = null;
    const result = report(11, row);
    expect(result.purchaseExpenses?.[0].amount).toBe(40000);
    expect(result.cashIncomplete).toBe(true);
    expect(result.warnings.join(' ')).toContain('riwayat giro');
    expect(result.warnings.join(' ')).not.toContain('metode belanja');
  });
});
