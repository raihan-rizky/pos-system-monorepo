import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx-js-style';
import { buildMonthlyPeriod, buildMonthlyReport, type MonthlyExpenseInput } from '../monthly-report-core';
import { buildMonthlyWorkbook, serializeMonthlyWorkbook } from '../monthly-workbook';

const period = buildMonthlyPeriod(2026, 9, new Date('2026-10-01T00:00:00Z'));
const expense: MonthlyExpenseInput = {
  id: 'weekly', occurredAt: new Date('2026-09-02T03:00:00Z'), category: 'OTHER',
  customCategory: { name: 'Gaji/Mingguan' }, amount: 120000, changeAmount: 20000,
  description: 'Pembayaran contoh',
};

function report(expenses: MonthlyExpenseInput[]) {
  return buildMonthlyReport({ year: 2026, month: 9, period, expenses, transactions: [], manualReceivables: [] });
}

describe('kategori Gaji/Mingguan pada laporan bulanan', () => {
  it.each(['Gaji/Mingguan', 'gaji/mingguan', ' GAJI / MINGGUAN ', 'Gaji/ Mingguan', 'Ｇａｊｉ／Ｍｉｎｇｇｕａｎ'])(
    'memasukkan kategori lengkap %s ke kelompok Gaji/Mingguan', name => {
      expect(report([{ ...expense, customCategory: { name } }]).expenses[0]).toMatchObject({
        categoryName: name, amount: 100000, group: 'SALARY',
      });
    },
  );

  it.each([
    { category: 'SALARY', customCategory: null },
    { category: 'SUPPLIES', customCategory: null },
    { category: 'OTHER', customCategory: { name: 'Gaji' } },
    { category: 'OTHER', customCategory: { name: 'Mingguan' } },
    { category: 'OTHER', customCategory: { name: 'Gaji/Mingguan tambahan' } },
    { category: 'OTHER', customCategory: { name: 'Bukan Gaji/Mingguan' } },
    { category: 'OTHER', customCategory: { name: 'Kemasan' } },
  ])('menempatkan kategori lain $category $customCategory ke Nilai', category => {
    expect(report([{ ...expense, ...category, description: 'Gaji/Mingguan' }]).expenses[0]).toMatchObject({
      amount: 100000, group: 'OTHER',
    });
  });

  it('memindahkan kolom saat kategori diubah dan laporan diekspor ulang', () => {
    const selected = buildMonthlyWorkbook(report([expense])).Sheets['RP SEPTEMBER'];
    expect([selected.D7.v, selected.E7.v, selected.F7.v]).toEqual([0, 100000, 100000]);

    const changed = buildMonthlyWorkbook(report([{ ...expense, category: 'SALARY', customCategory: null }])).Sheets['RP SEPTEMBER'];
    expect([changed.D7.v, changed.E7.v, changed.F7.v]).toEqual([100000, 0, 100000]);

    const reselected = buildMonthlyWorkbook(report([expense])).Sheets['RP SEPTEMBER'];
    expect([reselected.D7.v, reselected.E7.v, reselected.F7.v]).toEqual([0, 100000, 100000]);
  });

  it('menghitung bersih sekali, mengecualikan data terhapus dan di luar periode', () => {
    const result = report([
      expense, expense,
      { ...expense, id: 'deleted', deletedAt: new Date('2026-09-03T00:00:00Z') },
      { ...expense, id: 'previous', occurredAt: new Date('2026-08-31T16:59:59Z') },
      { ...expense, id: 'next', occurredAt: new Date('2026-09-30T17:00:00Z') },
    ]);
    expect(result.expenses).toHaveLength(1);
    expect(result.expenses[0]).toMatchObject({ amount: 100000, group: 'SALARY' });
    const workbook = buildMonthlyWorkbook(result);
    expect(workbook.Sheets['RP SEPTEMBER'].E9.v).toBe(100000);
    expect(workbook.Sheets['RP SEPTEMBER'].F9.v).toBe(100000);
    expect(workbook.Sheets.BERSIH.F25.v).toBe(100000);
  });

  it('menjaga kolom RP, rekap harian dan BERSIH konsisten termasuk rumus setelah disimpan', () => {
    const data = report([
      { ...expense, id: 'a-weekly' },
      { ...expense, id: 'b-salary', category: 'SALARY', customCategory: null, amount: 60000, changeAmount: 10000 },
      { ...expense, id: 'c-other', customCategory: { name: 'Kemasan' }, amount: 30000, changeAmount: 0 },
    ]);
    const workbook = buildMonthlyWorkbook(data);
    const rp = workbook.Sheets['RP SEPTEMBER'];
    expect([rp.D7.v, rp.E7.v, rp.F7.v, rp.G7.v, rp.H7?.v]).toEqual([0, 100000, 100000, 'Gaji/Mingguan', 'Gaji / Mingguan']);
    expect([rp.D8.v, rp.E8.v, rp.F8.v]).toEqual([50000, 0, 50000]);
    expect([rp.D9.v, rp.E9.v, rp.F9.v]).toEqual([30000, 0, 30000]);
    expect([rp.D11.v, rp.E11.v, rp.F11.v]).toEqual([80000, 100000, 180000]);
    expect(rp.F7.f).toBe('SUM(D7:E7)');
    expect(rp['!cols']?.[7]?.hidden).toBe(true);

    const daily = workbook.Sheets.SEPTEMBER;
    expect([daily.K10.v, daily.L10.v]).toEqual([80000, 100000]);
    expect(daily.L10.f).toContain('$H$7:$H$9,"Gaji / Mingguan"');
    expect(daily.K10.f).toContain('$H$7:$H$9,"Lain-lain"');
    expect([workbook.Sheets.BERSIH.I13.v, workbook.Sheets.BERSIH.J13.v, workbook.Sheets.BERSIH.F25.v]).toEqual([80000, 100000, 180000]);

    const exported = XLSX.read(serializeMonthlyWorkbook(data), { type: 'array', cellFormula: true });
    expect([exported.Sheets['RP SEPTEMBER'].D7.v, exported.Sheets['RP SEPTEMBER'].E7.v, exported.Sheets['RP SEPTEMBER'].F11.v]).toEqual([0, 100000, 180000]);
    expect(exported.Sheets.SEPTEMBER.L10.f).toContain('$H$7:$H$9,"Gaji / Mingguan"');
  });
});
