import { describe, expect, it } from 'vitest';
import { buildMonthlyPeriod, buildMonthlyReport } from '../monthly-report-core';

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
const purchase = (method: 'GIRO' | 'TRANSFER') => ({
  id: 'b1', storeId: 'store-1', purchaseDate: date('2026-10-05'), paymentMethod: method,
  dueDate: date('2026-11-20'), reference: 'REF-1', amount: 100,
  payments: [
    { id: 'p1', amount: 30, paidAt: date('2026-10-31') },
    { id: 'p2', amount: 20, paidAt: date('2026-11-01') },
    { id: 'p3', amount: 50, paidAt: date('2026-12-01') },
  ],
});
const report = (month: number, ledger: unknown[], expenses: unknown[] = [], now = new Date('2027-01-01T00:00:00Z')) =>
  buildMonthlyReport({ year: 2026, month, period: buildMonthlyPeriod(2026, month, now), transactions: [], expenses, manualReceivables: [], backdatedPurchases: ledger } as never);

describe('belanja terdahulu pada laporan bulanan', () => {
  it('menjadwalkan giro penuh pada bulan jatuh tempo, pembayaran pada tanggal aktual, dan hutang pada akhir periode', () => {
    const october = report(10, [purchase('GIRO')]);
    const november = report(11, [purchase('GIRO')]);
    const december = report(12, [purchase('GIRO')]);
    expect(october.purchaseExpenses).toEqual([]);
    expect(october.giroPayments).toEqual([expect.objectContaining({ amount: 30, date: '2026-10-31' })]);
    expect(october.supplierDebts).toEqual([expect.objectContaining({ amount: 70 })]);
    expect(november.purchaseExpenses).toEqual([expect.objectContaining({ amount: 100, date: '2026-11-20', purchase: expect.objectContaining({ method: 'GIRO', reference: 'REF-1' }) })]);
    expect(november.giroPayments).toEqual([expect.objectContaining({ amount: 20, date: '2026-11-01' })]);
    expect(november.supplierDebts).toEqual([expect.objectContaining({ amount: 50 })]);
    expect(december.purchaseExpenses).toEqual([]);
    expect(december.giroPayments).toEqual([expect.objectContaining({ amount: 50, date: '2026-12-01' })]);
    expect(december.supplierDebts).toEqual([]);
  });

  it('mencatat transfer parsial hanya pada tanggal pembayaran dan menyisakan hutang', () => {
    const october = report(10, [purchase('TRANSFER')]);
    const november = report(11, [purchase('TRANSFER')]);
    expect(october.purchaseExpenses).toEqual([expect.objectContaining({ amount: 30, date: '2026-10-31', purchase: expect.objectContaining({ method: 'TRANSFER' }) })]);
    expect(october.supplierDebts).toEqual([expect.objectContaining({ amount: 70 })]);
    expect(november.purchaseExpenses).toEqual([expect.objectContaining({ amount: 20, date: '2026-11-01' })]);
    expect(november.supplierDebts).toEqual([expect.objectContaining({ amount: 50 })]);
    expect(november.giroPayments).toEqual([]);
  });

  it('menampilkan giro yang belum dibayar sebagai jadwal penuh dan hutang penuh, termasuk jatuh tempo mendatang pada bulan ini', () => {
    const unpaid = { ...purchase('GIRO'), payments: [] };
    const result = report(11, [unpaid], [], new Date('2026-11-02T02:00:00Z'));
    expect(result.purchaseExpenses).toEqual([expect.objectContaining({ date: '2026-11-20', amount: 100 })]);
    expect(result.supplierDebts).toEqual([expect.objectContaining({ amount: 100 })]);
    expect(result.giroPayments).toEqual([]);
  });

  it('tetap menjadwalkan giro penuh yang telah lunas sebelum jatuh tempo', () => {
    const prepaid = { ...purchase('GIRO'), payments: [{ id: 'p', amount: 100, paidAt: date('2026-10-10') }] };
    const result = report(11, [prepaid]);
    expect(result.purchaseExpenses).toEqual([expect.objectContaining({ amount: 100 })]);
    expect(result.supplierDebts).toEqual([]);
    expect(result.giroPayments).toEqual([]);
  });

  it('tidak menghitung kewajiban sebelum tanggal pembelian atau pengeluaran otomatis pada RP', () => {
    const derived = { id: 'derived', occurredAt: new Date('2026-11-01T03:00:00Z'), category: 'SUPPLIES', amount: 20, changeAmount: 0, description: 'Otomatis', backdatedPurchasePaymentId: 'p2' };
    const due = { ...derived, id: 'due', backdatedPurchasePaymentId: null, backdatedPurchaseDueId: 'b1' };
    expect(report(9, [purchase('GIRO')]).supplierDebts).toEqual([]);
    expect(report(11, [purchase('GIRO')], [derived, due]).expenses).toEqual([]);
  });

  it('menandai riwayat pembayaran yang melebihi nilai pembelian sebagai belum lengkap', () => {
    const invalid = { ...purchase('GIRO'), payments: [{ id: 'bad', amount: 101, paidAt: date('2026-10-10') }] };
    const result = report(11, [invalid]);
    expect(result.cashIncomplete).toBe(true);
    expect(result.supplierDebtIncomplete).toBe(true);
    expect(result.warnings.join(' ')).toContain('belanja terdahulu');
  });
});
