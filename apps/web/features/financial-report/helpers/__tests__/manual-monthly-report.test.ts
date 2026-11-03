import { describe, expect, it } from 'vitest';
import { buildMonthlyPeriod, buildMonthlyReport } from '../monthly-report-core';
import { buildMonthlyWorkbook } from '../monthly-workbook';
import { MANUAL_INCOME_CATEGORIES } from '@/features/keuangan/helpers/manual-finance';

const occurredAt = new Date('2026-11-01T17:00:00Z');
const income = { id: 'income-1', occurredAt, description: 'Pemasukan contoh', category: 'ATK' as const, amount: 100000 };
const expense = { id: 'expense-1', occurredAt, description: 'Kertas contoh', category: 'SUPPLIES', amount: 25000, changeAmount: 0, applicantName: 'Pemasok contoh', manualPurchasePaymentMethod: 'TRANSFER' };
const input = { year: 2026, month: 11, period: buildMonthlyPeriod(2026, 11, new Date('2026-12-01')), transactions: [], manualReceivables: [], expenses: [expense], manualIncome: [income] };

describe('pencatatan manual dalam Excel bulanan', () => {
  it.each(MANUAL_INCOME_CATEGORIES)('memasukkan seluruh nominal ke kolom %s', category => {
    const report = buildMonthlyReport({ ...input, manualIncome: [{ ...income, category }] });
    expect(report.income).toHaveLength(1);
    expect(report.income[0]).toMatchObject({ id: 'manual-income:income-1', date: '2026-11-02', description: income.description });
    expect(report.income[0].amounts[category]).toBe(100000);
    expect(Object.values(report.income[0].amounts).reduce((sum, amount) => sum + amount, 0)).toBe(100000);
  });
  it('mengabaikan duplikat, catatan terhapus, dan periode lain', () => {
    const report = buildMonthlyReport({ ...input, manualIncome: [income, income, { ...income, id: 'deleted', deletedAt: occurredAt }, { ...income, id: 'old', occurredAt: new Date('2026-10-31T16:59:59Z') }, { ...income, id: 'next', occurredAt: new Date('2026-11-30T17:00:00Z') }] });
    expect(report.income).toHaveLength(1);
    expect(buildMonthlyReport({ ...input, manualIncome: [{ ...income, category: 'CETAK' }] }).income[0].amounts).toMatchObject({ ATK: 0, CETAK: 100000 });
    expect(buildMonthlyReport({ ...input, manualIncome: [{ ...income, deletedAt: occurredAt }] }).income).toEqual([]);
  });
  it('memakai satu pengeluaran untuk RP dan rincian transfer tanpa duplikasi', () => {
    const report = buildMonthlyReport({ ...input, expenses: [expense, expense] });
    expect(report.purchaseExpenses).toHaveLength(1);
    expect(report.purchaseExpenses![0]).toMatchObject({ amount: 25000, purchase: { reference: 'Belanja manual expense-1', method: 'TRANSFER', supplier: 'Pemasok contoh', dueDate: null } });
    const workbook = buildMonthlyWorkbook(report);
    expect(workbook.Sheets['RC NOVEMBER'].F7.v).toBe(100000);
    expect(workbook.Sheets['RC NOVEMBER'].I7.v).toBe(100000);
    expect(workbook.Sheets.BERSIH.F24.v).toBe(100000);
    expect(workbook.Sheets.BERSIH.F25.v).toBe(25000);
    expect(workbook.Sheets.BERSIH.F27.v).toBe(75000);
    const cells = Object.values(workbook.Sheets['PENGELUARAN BELANJA']);
    expect(cells.filter(cell => cell?.v === 25000 && !cell.f)).toHaveLength(2);
    expect(cells.some(cell => String(cell?.v).includes('Pemasok contoh'))).toBe(true);
  });
});
