import { describe, expect, it } from 'vitest';
import { allocateMonthlyIncome, buildMonthlyPeriod, buildMonthlyReport } from '../monthly-report-core';

const now = new Date('2026-10-21T06:00:00Z');
const period = buildMonthlyPeriod(2026, 9, now);
const sale = (extra = {}) => ({ id: 't1', invoiceNumber: 'INV-1', invoiceDate: new Date('2026-08-01T03:00:00Z'), createdAt: new Date('2026-08-01T03:00:00Z'), status: 'COMPLETED', paymentMethod: 'CASH', total: 100, amountPaid: 120, change: 20, transactionCategory: 'PERCETAKAN', printingSubcategory: 'PLAT', customerName: 'Pelanggan contoh', items: [{ productName: 'Contoh', subtotal: 100 }], payments: [{ id: 'p1', method: 'CASH', amount: 60, createdAt: new Date('2026-08-01T03:00:00Z') }], debtPaymentLogs: [{ id: 'd1', paymentMethod: 'TRANSFER', amount: 60, createdAt: new Date('2026-09-02T03:00:00Z') }], ...extra });
const report = (transactions: ReturnType<typeof sale>[], extra = {}) => buildMonthlyReport({ year: 2026, month: 9, period, transactions, expenses: [], manualReceivables: [], ...extra });

describe('periode bulanan WIB', () => {
  it('mencakup Februari kabisat dengan akhir eksklusif', () => {
    expect(buildMonthlyPeriod(2024, 2, now)).toEqual({ from: '2024-02-01', to: '2024-02-29', start: new Date('2024-01-31T17:00:00Z'), end: new Date('2024-02-29T17:00:00Z') });
  });
  it('membatasi bulan berjalan pada tanggal WIB hari ini', () => {
    expect(buildMonthlyPeriod(2026, 10, new Date('2026-10-21T18:00:00Z')).to).toBe('2026-10-22');
    expect(buildMonthlyPeriod(2026, 12, new Date('2026-12-31T16:59:00Z')).end.toISOString()).toBe('2026-12-31T17:00:00.000Z');
    expect(buildMonthlyPeriod(2026, 4, now).to).toBe('2026-04-30');
  });
  it.each([[2026, 11], [2026, 0], [2026, 13], [2026, 1.5], [NaN, 1], [0, 1], [1899, 12]])('menolak tahun/bulan tidak sah atau mendatang (%s/%s)', (year, month) => expect(() => buildMonthlyPeriod(year, month, now)).toThrow());
});

describe('normalisasi laporan bulanan', () => {
  it('membagi sen secara proporsional dan deterministik tanpa membuang kategori asing', () => {
    const result = allocateMonthlyIncome(10, [{ group: 'ATK', amount: 1 }, { group: 'PRINT', amount: 1 }, { group: 'UNMAPPED', amount: 1 }]);
    expect(result).toMatchObject({ ATK: 3.34, PRINT: 3.33, UNMAPPED: 3.33 });
    expect(Math.round(Object.values(result).reduce((a,b) => a+b, 0)*100)).toBe(1000);
  });
  it('menggunakan tanggal event dan menghitung pelunasan hanya sekali', () => {
    const result = report([sale()]);
    expect(result.income).toHaveLength(1);
    expect(result.income[0]).toMatchObject({ date: '2026-09-02', amounts: { PLAT: 60 } });
    expect(result.receivables).toEqual([]);
  });
  it('mempertahankan DP, saldo tempo, dan sen tanpa menghitung baris pelunasan duplikat', () => {
    const event = { id: 'd1', paymentMethod: 'TRANSFER', amount: 25.01, createdAt: new Date('2026-09-02T03:00:00Z') };
    const result = report([sale({ status: 'DP', total: 100.03, amountPaid: 50.02, change: 0, paymentMethod: 'TEMPO', payments: [{ id: 'p1', method: 'CASH', amount: 25.01, createdAt: new Date('2026-09-01T03:00:00Z') }], debtPaymentLogs: [event, event] })]);
    expect(result.income.map(row => row.amounts.PLAT)).toEqual([25.01, 25.01]);
    expect(result.receivables[0].amount).toBe(50.01);
  });
  it.each([['PERCETAKAN', 'CETAK'], ['PLAT', 'PLAT'], ['STEMPEL', 'STEMPEL'], ['SPANDUK', 'SPANDUK'], ['PRINT', 'PRINT']])('memetakan subkategori eksplisit %s ke %s', (subcategory, group) => {
    const result = report([sale({ printingSubcategory: subcategory })]);
    expect(result.income[0].amounts[group as keyof typeof result.income[0]['amounts']]).toBe(60);
  });
  it('menyimpan saldo historis setelah pelunasan di bulan berikutnya', () => {
    const result = report([sale({ debtPaymentLogs: [{ id: 'd1', paymentMethod: 'TRANSFER', amount: 60, createdAt: new Date('2026-10-02T03:00:00Z') }] })]);
    expect(result.income).toEqual([]);
    expect(result.receivables[0].amount).toBe(60);
  });
  it('mengembalikan kembalian dari split tunai sebelum filter tanggal event', () => {
    const result = report([sale({ amountPaid: 150, change: 50, payments: [{ id: 'p1', method: 'CASH', amount: 100, createdAt: new Date('2026-08-31T16:59:00Z') }, { id: 'p2', method: 'TRANSFER', amount: 50, createdAt: new Date('2026-08-31T17:00:00Z') }], debtPaymentLogs: [] })]);
    expect(result.income).toHaveLength(1);
    expect(result.income[0].amounts.PLAT).toBe(50);
    expect(result.receivables).toEqual([]);
  });
  it('mendukung pembayaran awal legacy dan mengabaikan draft/batal', () => {
    const result = report([sale({ createdAt: new Date('2026-09-03T03:00:00Z'), payments: [], debtPaymentLogs: [], amountPaid: 130, change: 30 }), sale({ id: 'draft', status: 'DRAFT' }), sale({ id: 'cancel', status: 'CANCELLED' })]);
    expect(result.income).toHaveLength(1);
    expect(result.income[0].amounts.PLAT).toBe(100);
  });
  it('mengutamakan metadata transaksi dan tidak menebak barang tanpa kategori', () => {
    const result = report([sale({ transactionCategory: null, printingSubcategory: null, createdAt: new Date('2026-09-03T03:00:00Z'), payments: [], debtPaymentLogs: [], amountPaid: 100, change: 0, items: [{ productName: 'ATK dalam nama bukan kategori', subtotal: 100 }] })]);
    expect(result.income[0].amounts.UNMAPPED).toBe(100);
    expect(result.warnings.some(text => text.includes('pemetaan'))).toBe(true);
  });
  it('memasukkan piutang manual serta penerimaan yang benar-benar dibayar pada periode', () => {
    const result = report([], { manualReceivables: [{ id: 'm1', debtDate: new Date('2026-08-01T00:00:00Z'), dueDate: new Date('2026-09-30T00:00:00Z'), amount: 200, amountPaid: 200, note: 'Saldo awal', customer: { name: 'Contoh' }, payments: [{ id: 'mp1', method: 'CASH', amount: 50, createdAt: new Date('2026-09-10T03:00:00Z') }, { id: 'mp2', method: 'CASH', amount: 150, createdAt: new Date('2026-10-10T03:00:00Z') }] }] });
    expect(result.receivables[0]).toMatchObject({ amount: 150, date: '2026-08-01', dueDate: '2026-09-30' });
    expect(result.income[0].amounts.UNMAPPED).toBe(50);
  });
  it('menghitung net expense sekali, mempertahankan salary, serta mengecualikan belanja belum disetujui/deleted', () => {
    const expense = { id: 'e1', occurredAt: new Date('2026-09-02T03:00:00Z'), category: 'SUPPLIES', amount: 120, changeAmount: 20, description: 'Contoh', goodsPurchase: { number: 'PB-1', status: 'APPROVED', paymentMethod: 'GIRO', paymentDueDate: null, supplierNameSnapshot: 'Pemasok contoh' } };
    const result = report([], { expenses: [expense, expense, { ...expense, id: 'salary', category: 'SALARY', goodsPurchase: null }, { ...expense, id: 'pending', goodsPurchase: { ...expense.goodsPurchase, status: 'PENDING' } }, { ...expense, id: 'deleted', deletedAt: new Date() }] });
    expect(result.expenses).toHaveLength(2);
    expect(result.expenses.map(row => [row.amount, row.group])).toEqual([[100, 'OTHER'], [100, 'SALARY']]);
    expect(result.expenses[0].purchase?.reference).toBe('PB-1');
    expect(result.inventoryBalance).toBeNull();
    expect(result.supplierDebtBalance).toBeNull();
    expect(result.warnings.join(' ')).toContain('Belum tersedia dari sistem');
    expect(result.warnings.join(' ')).toContain('pengembalian dana');
  });
  it('mengecualikan expense dari permintaan belanja pending atau ditolak', () => {
    const expense = { id: 'e1', occurredAt: new Date('2026-09-02T03:00:00Z'), category: 'SUPPLIES', amount: 100, changeAmount: 0, description: 'Contoh', shoppingRequest: { status: 'REQUESTED' } };
    expect(report([], { expenses: [expense, { ...expense, id: 'e2', shoppingRequest: { status: 'REJECTED' } }] }).expenses).toEqual([]);
  });
  it('memberi catatan jika snapshot biaya expense belum lengkap', () => {
    const expense = { id: 'e1', occurredAt: new Date('2026-09-02T03:00:00Z'), category: 'SUPPLIES', amount: 0, changeAmount: 0, description: 'Biaya belum lengkap', hasMissingCostSnapshot: true };
    expect(report([], { expenses: [expense] }).warnings.join(' ')).toContain('snapshot biaya');
  });
});
