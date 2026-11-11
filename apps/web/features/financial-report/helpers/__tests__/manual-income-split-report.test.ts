import { describe, expect, it } from 'vitest';
import { buildDailyIncome } from '../daily-income';

const date = '2026-11-09';
const income = {
  id: 'income-1', occurredAt: new Date('2026-11-08T17:00:00Z'), category: 'ATK', amount: 100000,
  payments: [{ method: 'CASH', amount: 40000 }, { method: 'TRANSFER', amount: 60000 }],
};

describe('laporan harian untuk pemasukan dengan beberapa metode', () => {
  it('memecah metode tanpa menggandakan total atau kategori', () => {
    const report = buildDailyIncome({ date, transactions: [], manualIncome: [income, income] });
    expect(report.total).toBe(100000);
    expect(report.categories).toEqual([{ category: 'ATK', amount: 100000 }]);
    expect(report.subcategories).toEqual([{ category: 'ATK', subcategory: 'Pemasukan manual', amount: 100000 }]);
    expect(report.paymentMethods).toEqual([{ method: 'CASH', amount: 40000 }, { method: 'TRANSFER', amount: 60000 }]);
  });

  it('tetap menandai pemasukan lama yang tidak memiliki rincian', () => {
    const report = buildDailyIncome({ date, transactions: [], manualIncome: [{ ...income, payments: [] }] });
    expect(report.paymentMethods).toEqual([{ method: 'Belum dicatat', amount: 100000 }]);
  });

  it('tidak menampilkan rincian yang rusak sebagai total metode yang tidak seimbang', () => {
    const report = buildDailyIncome({ date, transactions: [], manualIncome: [{ ...income, payments: [{ method: 'CASH', amount: 1 }] }] });
    expect(report.paymentMethods).toEqual([{ method: 'Belum dicatat', amount: 100000 }]);
  });

  it('mengabaikan catatan terhapus dan yang berada di luar tanggal WIB', () => {
    const report = buildDailyIncome({ date, transactions: [], manualIncome: [
      { ...income, id: 'deleted', deletedAt: new Date('2026-11-10T00:00:00Z') },
      { ...income, id: 'previous', occurredAt: new Date('2026-11-08T16:59:59Z') },
      { ...income, id: 'next', occurredAt: new Date('2026-11-09T17:00:00Z') },
    ] });
    expect(report.total).toBe(0);
    expect(report.paymentMethods).toEqual([]);
  });
});
